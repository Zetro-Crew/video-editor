import { RabbitMQContainer } from "@testcontainers/rabbitmq";
import {
	EXCHANGE_NAME,
	EXPORT_COMPLETED,
	EXPORT_COMPLETED_V1,
	EXPORT_FAILED,
	EXPORT_FAILED_V1,
	EXPORT_STARTED,
	EXPORT_STARTED_V1,
	X_EVENT_NAME,
	X_EVENT_VERSION,
} from "@video-editor/contract/events";
import { Logger } from "@ztube/observability";
import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import { connect } from "amqplib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createNoopMonitorFactory } from "../createNoopMonitorFactory.ts";
import { PublishExhaustedError, RabbitMQPublisher, UnroutedError } from "../RabbitMQPublisher.ts";
import {
	COMMANDS_EXCHANGE,
	RENDER_REQUESTED,
	RENDER_REQUESTED_QUEUE,
	RENDER_REQUESTED_V1,
} from "../schemas/commands.ts";
import { createRecordingMonitorFactory } from "./createRecordingMonitorFactory.ts";

let amqpUrl: string;
let stopContainer: () => Promise<void>;

beforeAll(async () => {
	const container = await new RabbitMQContainer("rabbitmq:3-management").start();
	amqpUrl = container.getAmqpUrl();
	stopContainer = async () => {
		await container.stop();
	};
}, 60_000);

afterAll(async () => {
	await stopContainer?.();
});

describe("RabbitMQPublisher — envelope + headers", { timeout: 60_000 }, () => {
	let publisher: RabbitMQPublisher;

	beforeAll(async () => {
		publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory());
		await publisher.connect();
	});

	afterAll(async () => {
		await publisher.close();
	});

	async function setupConsumer(routingKey: string): Promise<() => Promise<ConsumeMessage>> {
		const conn = await connect(amqpUrl);
		conn.on("error", () => {});
		conn.on("close", () => {});
		const ch = await conn.createChannel();
		ch.on("error", () => {});
		ch.on("close", () => {});
		await ch.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
		const { queue } = await ch.assertQueue("", { exclusive: true });
		await ch.bindQueue(queue, EXCHANGE_NAME, routingKey);

		let resolveMsg!: (msg: ConsumeMessage) => void;
		const msgPromise = new Promise<ConsumeMessage>((r) => {
			resolveMsg = r;
		});
		await ch.consume(
			queue,
			(m) => {
				if (m) resolveMsg(m);
			},
			{ noAck: true },
		);

		return async () => {
			const msg = await msgPromise;
			try {
				await ch.close();
			} catch {}
			try {
				await conn.close();
			} catch {}
			return msg;
		};
	}

	it("wraps export.started payload in envelope and sets headers", async () => {
		const collect = await setupConsumer(EXPORT_STARTED);
		await publisher.publishExportStarted({
			jobId: "j1",
			mediaId: "550e8400-e29b-41d4-a716-446655440000",
			mediaName: "clip",
			downloadToComputer: true,
			saveToPersonalChannel: false,
			selectedUnitChannelIds: ["ch1"],
			exportType: "mp4",
			items: [{ type: "clip", id: "media-1" }],
		});

		const msg = await collect();
		const envelope = JSON.parse(msg.content.toString()) as Record<string, unknown>;

		expect(msg.fields.routingKey).toBe(EXPORT_STARTED);
		expect(envelope.eventName).toBe(EXPORT_STARTED);
		expect(envelope.eventVersion).toBe(EXPORT_STARTED_V1);
		expect(typeof envelope.occurredAt).toBe("string");
		expect((envelope.data as Record<string, unknown>).jobId).toBe("j1");
		expect((envelope.data as Record<string, unknown>).mediaName).toBe("clip");
		expect(msg.properties.headers?.[X_EVENT_NAME]).toBe(EXPORT_STARTED);
		expect(msg.properties.headers?.[X_EVENT_VERSION]).toBe(EXPORT_STARTED_V1);
		expect(msg.properties.contentType).toBe("application/json");
	});

	it("wraps export.completed payload in envelope and sets headers", async () => {
		const collect = await setupConsumer(EXPORT_COMPLETED);
		await publisher.publishExportCompleted({
			jobId: "j2",
			url: "https://s3.example.com/out.mp4",
			exportType: "mp4",
		});
		const msg = await collect();
		const envelope = JSON.parse(msg.content.toString()) as Record<string, unknown>;

		expect(envelope.eventName).toBe(EXPORT_COMPLETED);
		expect(envelope.eventVersion).toBe(EXPORT_COMPLETED_V1);
		expect((envelope.data as Record<string, unknown>).url).toBe("https://s3.example.com/out.mp4");
		expect(msg.properties.headers?.[X_EVENT_NAME]).toBe(EXPORT_COMPLETED);
		expect(msg.properties.headers?.[X_EVENT_VERSION]).toBe(EXPORT_COMPLETED_V1);
	});

	it("wraps export.failed payload in envelope and sets headers", async () => {
		const collect = await setupConsumer(EXPORT_FAILED);
		await publisher.publishExportFailed({ jobId: "j3", error: "ffmpeg segfault" });
		const msg = await collect();
		const envelope = JSON.parse(msg.content.toString()) as Record<string, unknown>;

		expect(envelope.eventName).toBe(EXPORT_FAILED);
		expect(envelope.eventVersion).toBe(EXPORT_FAILED_V1);
		expect((envelope.data as Record<string, unknown>).error).toBe("ffmpeg segfault");
		expect(msg.properties.headers?.[X_EVENT_NAME]).toBe(EXPORT_FAILED);
		expect(msg.properties.headers?.[X_EVENT_VERSION]).toBe(EXPORT_FAILED_V1);
	});
});

describe("RabbitMQPublisher — mandatory + retry + monitor lifecycle", { timeout: 60_000 }, () => {
	it("retries 3 times and logs aborting with UnroutedError when no queue is bound", async () => {
		const { factory, events } = createRecordingMonitorFactory();
		const publisher = new RabbitMQPublisher(amqpUrl, factory);
		await publisher.connect();
		try {
			// No consumer bound — broker returns the message; publisher retries 2× then aborts.
			await publisher.publishExportFailed({ jobId: "no-bind", error: "n/a" });
		} finally {
			await publisher.close();
		}

		const started = events.filter((e) => e.type === "started");
		const retries = events.filter((e) => e.type === "retry");
		const aborting = events.filter((e) => e.type === "aborting");
		const success = events.filter((e) => e.type === "success");

		expect(started).toHaveLength(1);
		expect(retries).toHaveLength(2);
		expect(success).toHaveLength(0);
		expect(aborting).toHaveLength(1);

		for (const r of retries) {
			expect(r.type === "retry" && r.error instanceof UnroutedError).toBe(true);
		}
		expect(aborting[0].type === "aborting" && /UnroutedError/.test(aborting[0].error.message)).toBe(
			false,
		);
		// Aborting receives PublishExhaustedError whose .cause is the UnroutedError.
		expect(aborting[0].type === "aborting" && aborting[0].error.name).toBe("PublishExhaustedError");
	});

	it("does not rethrow PublishExhaustedError to the caller (controller never sees it)", async () => {
		const { factory } = createRecordingMonitorFactory();
		const publisher = new RabbitMQPublisher(amqpUrl, factory);
		await publisher.connect();
		try {
			await expect(
				publisher.publishExportFailed({ jobId: "swallow", error: "n/a" }),
			).resolves.toBeUndefined();
		} finally {
			await publisher.close();
		}
	});
});

describe("RabbitMQPublisher — connect fail-fast", () => {
	it("connect() throws when broker is unreachable", async () => {
		const publisher = new RabbitMQPublisher("amqp://127.0.0.1:1", createNoopMonitorFactory(), {
			initialConnectTimeoutMs: 1_000,
		});
		await expect(publisher.connect()).rejects.toThrow();
	});

	it("connect() honors initialConnectTimeoutMs against a hung broker", async () => {
		// Black-holed port returns no SYN-ACK; connect would hang without our race.
		const publisher = new RabbitMQPublisher(
			"amqp://10.255.255.1:5672",
			createNoopMonitorFactory(),
			{
				initialConnectTimeoutMs: 800,
			},
		);
		const start = Date.now();
		await expect(publisher.connect()).rejects.toThrow();
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(2_500);
	}, 5_000);
});

describe("RabbitMQPublisher — drain", { timeout: 60_000 }, () => {
	it("drain returns quickly when no publishes are in-flight", async () => {
		const { factory } = createRecordingMonitorFactory();
		const publisher = new RabbitMQPublisher(amqpUrl, factory);
		await publisher.connect();
		const start = Date.now();
		await publisher.drain(5_000);
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(200);
		await publisher.close();
	});

	it("drain times out when inflight messages never confirm and returns within budget", async () => {
		const { factory } = createRecordingMonitorFactory();
		const publisher = new RabbitMQPublisher(amqpUrl, factory);
		await publisher.connect();

		// Inject a fake inflight entry that will never resolve.
		const internal = publisher as unknown as { inflight: Map<string, { settle: () => void }> };
		internal.inflight.set("stuck-id", { settle: () => {} });

		const start = Date.now();
		await publisher.drain(200);
		const elapsed = Date.now() - start;
		expect(elapsed).toBeGreaterThanOrEqual(200);
		expect(elapsed).toBeLessThan(600);

		internal.inflight.clear();
		await publisher.close();
	});
});

describe("RabbitMQPublisher — commands exchange + publishCommand", { timeout: 60_000 }, () => {
	it("asserts video-editor.commands exchange + render.requested quorum queue on connect", async () => {
		const publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory());
		await publisher.connect();
		try {
			// If topology assertion was idempotent, a second consumer can bind without conflict.
			const conn = await connect(amqpUrl);
			conn.on("error", () => {});
			const ch = await conn.createChannel();
			ch.on("error", () => {});
			// Passively check the queue exists (passive=true throws if it doesn't).
			const info = await ch.checkQueue(RENDER_REQUESTED_QUEUE);
			expect(info.queue).toBe(RENDER_REQUESTED_QUEUE);
			await ch.close();
			await conn.close();
		} finally {
			await publisher.close();
		}
	});

	it("publishCommand publishes envelope to commands exchange + routes to render.requested", async () => {
		const publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory());
		await publisher.connect();
		const conn = await connect(amqpUrl);
		conn.on("error", () => {});
		const ch = await conn.createChannel();
		ch.on("error", () => {});

		let resolveMsg!: (msg: ConsumeMessage) => void;
		const msgPromise = new Promise<ConsumeMessage>((r) => {
			resolveMsg = r;
		});
		const { consumerTag } = await ch.consume(
			RENDER_REQUESTED_QUEUE,
			(m) => {
				if (m) resolveMsg(m);
			},
			{ noAck: true },
		);

		try {
			await publisher.publishCommand(RENDER_REQUESTED, RENDER_REQUESTED_V1, "job-1", {
				jobId: "job-1",
				answer: 42,
			});
			const msg = await msgPromise;
			const envelope = JSON.parse(msg.content.toString()) as Record<string, unknown>;
			expect(msg.fields.routingKey).toBe(RENDER_REQUESTED);
			expect(msg.fields.exchange).toBe(COMMANDS_EXCHANGE);
			expect(envelope.eventName).toBe(RENDER_REQUESTED);
			expect(envelope.eventVersion).toBe(RENDER_REQUESTED_V1);
			expect((envelope.data as { jobId: string }).jobId).toBe("job-1");
			expect(msg.properties.headers?.[X_EVENT_NAME]).toBe(RENDER_REQUESTED);
		} finally {
			try {
				await ch.cancel(consumerTag);
			} catch {}
			try {
				await ch.close();
			} catch {}
			try {
				await conn.close();
			} catch {}
			await publisher.close();
		}
	});

	it("publishCommand throws PublishExhaustedError after retries on unrouted return", async () => {
		const { factory, events } = createRecordingMonitorFactory();
		const publisher = new RabbitMQPublisher(amqpUrl, factory);
		await publisher.connect();
		try {
			// Use an unbound routing key on the commands exchange → mandatory return → retry until exhausted.
			await expect(
				publisher.publishCommand("fake.command", 1, "biz-1", { foo: "bar" }),
			).rejects.toBeInstanceOf(PublishExhaustedError);
		} finally {
			await publisher.close();
		}
		const aborting = events.filter((e) => e.type === "aborting");
		expect(aborting).toHaveLength(1);
		expect(aborting[0].type === "aborting" && aborting[0].error.name).toBe("PublishExhaustedError");
	});
});

describe("RabbitMQPublisher — closed/concurrent/drain edges", { timeout: 60_000 }, () => {
	async function bindCatchallQueue(routingKey: string): Promise<() => Promise<void>> {
		const conn = await connect(amqpUrl);
		conn.on("error", () => {});
		const ch = await conn.createChannel();
		ch.on("error", () => {});
		await ch.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
		const { queue } = await ch.assertQueue("", { exclusive: true });
		await ch.bindQueue(queue, EXCHANGE_NAME, routingKey);
		await ch.consume(queue, () => {}, { noAck: true });
		return async () => {
			try {
				await ch.close();
			} catch {}
			try {
				await conn.close();
			} catch {}
		};
	}

	it("connect() rejects after close()", async () => {
		const publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory());
		await publisher.connect();
		await publisher.close();
		await expect(publisher.connect()).rejects.toThrow(/closed/i);
	});

	it("two concurrent publishes share one channel after connect()", async () => {
		const teardown = await bindCatchallQueue(EXPORT_FAILED);
		const publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory());
		try {
			await publisher.connect();
			const internal = publisher as unknown as { channel: ConfirmChannel | null };
			const ch = internal.channel;
			expect(ch).not.toBeNull();
			await Promise.all([
				publisher.publishExportFailed({ jobId: "a", error: "x" }),
				publisher.publishExportFailed({ jobId: "b", error: "y" }),
			]);
			expect(internal.channel).toBe(ch);
			await publisher.publishExportFailed({ jobId: "c", error: "z" });
			expect(internal.channel).toBe(ch);
		} finally {
			await publisher.close();
			await teardown();
		}
	});

	it("resets channel on transient error and recreates it for the retry", async () => {
		const teardown = await bindCatchallQueue(EXPORT_COMPLETED);
		const { factory, events } = createRecordingMonitorFactory();
		const publisher = new RabbitMQPublisher(amqpUrl, factory);
		await publisher.connect();
		try {
			const internal = publisher as unknown as { channel: ConfirmChannel | null };
			const firstChannel = internal.channel;
			expect(firstChannel).not.toBeNull();
			// Force channel close — next publish must retry and re-create channel.
			try {
				await firstChannel?.close();
			} catch {}
			await publisher.publishExportCompleted({
				jobId: "ch-reset",
				url: "https://s3.example.com/out.mp4",
				exportType: "mp4",
			});
			expect(internal.channel).not.toBeNull();
			expect(internal.channel).not.toBe(firstChannel);
			const completedEvents = events.filter(
				(e) => e.config.stageName === `publish:${EXPORT_COMPLETED}`,
			);
			expect(completedEvents.some((e) => e.type === "success")).toBe(true);
		} finally {
			await publisher.close();
			await teardown();
		}
	});

	it("drain() waits for retry-pending publish to settle", async () => {
		const publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory());
		await publisher.connect();
		// No queue bound → publish will return unrouted on every attempt, triggering retries.
		const start = Date.now();
		const publishing = publisher.publishExportFailed({ jobId: "drain-retry", error: "n/a" });
		// Wait a beat so the first attempt has happened and the retry sleep has begun.
		await new Promise((r) => setTimeout(r, 50));
		await publisher.drain(5_000);
		const elapsed = Date.now() - start;
		// Backoffs are 200ms then 1000ms — drain must wait through both sleeps before exhaustion.
		expect(elapsed).toBeGreaterThanOrEqual(1_000);
		await publishing;
		await publisher.close();
	});

	it("drain warning is logged once per unconfirmed inflight on timeout", async () => {
		const publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory());
		await publisher.connect();
		const warnSpy = vi.spyOn(Logger, "logWarning").mockImplementation(() => {});
		try {
			const internal = publisher as unknown as { inflight: Map<string, { settle: () => void }> };
			internal.inflight.set("stuck-1", { settle: () => {} });
			await publisher.drain(150);
			expect(warnSpy).toHaveBeenCalledWith(
				"amqp_publish_drained_unconfirmed",
				expect.objectContaining({ messageId: "stuck-1" }),
			);
			internal.inflight.clear();
		} finally {
			warnSpy.mockRestore();
			await publisher.close();
		}
	});
});

describe("RabbitMQPublisher — setup failure backoff", { timeout: 60_000 }, () => {
	it("retries setup with backoff when topology assertion throws once", async () => {
		const publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory(), {
			recoveryMaxDelayMs: 1_500,
		});
		await publisher.connect();

		// Patch internal assertTopology to fail on the next setup call only.
		const internal = publisher as unknown as {
			assertTopology: (ch: ConfirmChannel) => Promise<void>;
			model: { _core: { _model: { close: () => Promise<void> } } } | null;
		};
		const original = internal.assertTopology.bind(publisher);
		let failNext = true;
		internal.assertTopology = async (ch: ConfirmChannel) => {
			if (failNext) {
				failNext = false;
				throw new Error("simulated topology assert failure");
			}
			await original(ch);
		};

		const warnSpy = vi.spyOn(Logger, "logWarning").mockImplementation(() => {});
		try {
			// Force a disconnect → setup re-runs (will fail once, then succeed).
			await internal.model?._core._model.close();
			// Wait for reconnect-scheduled (after the failed setup) then for success.
			const start = Date.now();
			while (Date.now() - start < 10_000) {
				const scheduled = warnSpy.mock.calls.some(
					(args) => args[0] === "amqp_publisher_reconnect_scheduled",
				);
				if (scheduled) break;
				await new Promise((r) => setTimeout(r, 50));
			}
			expect(
				warnSpy.mock.calls.some((args) => args[0] === "amqp_publisher_reconnect_scheduled"),
			).toBe(true);
			// And eventually the publisher should be usable again.
			const finalStart = Date.now();
			while (Date.now() - finalStart < 10_000) {
				if ((publisher as unknown as { channel: ConfirmChannel | null }).channel) break;
				await new Promise((r) => setTimeout(r, 50));
			}
			expect((publisher as unknown as { channel: ConfirmChannel | null }).channel).not.toBeNull();
		} finally {
			warnSpy.mockRestore();
			internal.assertTopology = original;
			await publisher.close();
		}
	});
});
