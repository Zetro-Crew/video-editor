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
import type { ChannelModel, ConfirmChannel, ConsumeMessage } from "amqplib";
import { connect } from "amqplib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createNoopMonitorFactory } from "../createNoopMonitorFactory.ts";
import { RabbitMQPublisher, UnroutedError } from "../RabbitMQPublisher.ts";
import { createRecordingMonitorFactory } from "./createRecordingMonitorFactory.ts";

describe("RabbitMQPublisher — envelope + headers", { timeout: 60_000 }, () => {
	let amqpUrl: string;
	let publisher: RabbitMQPublisher;
	let stopContainer: () => Promise<void>;

	beforeAll(async () => {
		const container = await new RabbitMQContainer("rabbitmq:3-management").start();
		amqpUrl = container.getAmqpUrl();
		publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory());
		await publisher.connect();
		stopContainer = async () => {
			await container.stop();
		};
	});

	afterAll(async () => {
		await publisher.close();
		await stopContainer?.();
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
	let amqpUrl: string;
	let stopContainer: () => Promise<void>;

	beforeAll(async () => {
		const container = await new RabbitMQContainer("rabbitmq:3-management").start();
		amqpUrl = container.getAmqpUrl();
		stopContainer = async () => {
			await container.stop();
		};
	});

	afterAll(async () => {
		await stopContainer?.();
	});

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
		const publisher = new RabbitMQPublisher("amqp://127.0.0.1:1", createNoopMonitorFactory());
		await expect(publisher.connect()).rejects.toThrow();
	});
});

describe("RabbitMQPublisher — drain", { timeout: 60_000 }, () => {
	let amqpUrl: string;
	let stopContainer: () => Promise<void>;

	beforeAll(async () => {
		const container = await new RabbitMQContainer("rabbitmq:3-management").start();
		amqpUrl = container.getAmqpUrl();
		stopContainer = async () => {
			await container.stop();
		};
	});

	afterAll(async () => {
		await stopContainer?.();
	});

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

describe("RabbitMQPublisher — background reconnect", { timeout: 60_000 }, () => {
	let amqpUrl: string;
	let stopContainer: () => Promise<void>;

	beforeAll(async () => {
		const container = await new RabbitMQContainer("rabbitmq:3-management").start();
		amqpUrl = container.getAmqpUrl();
		stopContainer = async () => {
			await container.stop();
		};
	});

	afterAll(async () => {
		await stopContainer?.();
	});

	it("starts reconnect loop on connection close and logs success when broker still reachable", async () => {
		const { factory, events } = createRecordingMonitorFactory();
		const publisher = new RabbitMQPublisher(amqpUrl, factory);
		await publisher.connect();

		// Force-close the underlying connection (broker still alive); reconnect loop should kick in.
		const internal = publisher as unknown as { connection: { close: () => Promise<void> } | null };
		await internal.connection?.close();

		// Wait a beat for reconnect loop to run.
		await new Promise((r) => setTimeout(r, 500));

		const reconnectEvents = events.filter((e) => e.config.stageName === "reconnect");
		expect(reconnectEvents.some((e) => e.type === "started")).toBe(true);
		expect(reconnectEvents.some((e) => e.type === "success")).toBe(true);

		await publisher.close();
	});

	it("close() during reconnect loop stops further attempts", async () => {
		const { factory, events } = createRecordingMonitorFactory();
		// Bad URL → connect throws (fail-fast); we cannot start the loop via connect().
		// Simulate: connect to good broker, then close it externally, then immediately
		// publisher.close() — loop should not keep spinning.
		const publisher = new RabbitMQPublisher(amqpUrl, factory);
		await publisher.connect();
		const internal = publisher as unknown as { connection: { close: () => Promise<void> } | null };
		await internal.connection?.close();
		await publisher.close();

		await new Promise((r) => setTimeout(r, 200));
		const eventsAfterClose = events.length;
		await new Promise((r) => setTimeout(r, 300));
		expect(events.length).toBe(eventsAfterClose);
	});
});

describe("RabbitMQPublisher — closed/concurrent/drain edges", { timeout: 60_000 }, () => {
	let amqpUrl: string;
	let stopContainer: () => Promise<void>;

	beforeAll(async () => {
		const container = await new RabbitMQContainer("rabbitmq:3-management").start();
		amqpUrl = container.getAmqpUrl();
		stopContainer = async () => {
			await container.stop();
		};
	});

	afterAll(async () => {
		await stopContainer?.();
	});

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

	it("two concurrent publishes share one connection (first-connect memo)", async () => {
		const teardown = await bindCatchallQueue(EXPORT_FAILED);
		const publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory());
		try {
			const internal = publisher as unknown as { connection: ChannelModel | null };
			expect(internal.connection).toBeNull();
			await Promise.all([
				publisher.publishExportFailed({ jobId: "a", error: "x" }),
				publisher.publishExportFailed({ jobId: "b", error: "y" }),
			]);
			const conn = internal.connection;
			expect(conn).not.toBeNull();
			// Issue a third publish; same connection reused.
			await publisher.publishExportFailed({ jobId: "c", error: "z" });
			expect(internal.connection).toBe(conn);
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
			const completedEvents = events.filter((e) => e.config.stageName === EXPORT_COMPLETED);
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
		// First retry backoff is 100ms, second is 500ms — total at least ~600ms before exhaustion.
		expect(elapsed).toBeGreaterThanOrEqual(500);
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
