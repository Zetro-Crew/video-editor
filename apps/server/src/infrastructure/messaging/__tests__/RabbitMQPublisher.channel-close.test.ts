import { RabbitMQContainer } from "@testcontainers/rabbitmq";
import type { ConfirmChannel } from "amqplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNoopMonitorFactory } from "../createNoopMonitorFactory.ts";
import { ChannelClosedError, RabbitMQPublisher } from "../RabbitMQPublisher.ts";

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

describe("RabbitMQPublisher — channel close + handler-error", { timeout: 60_000 }, () => {
	it("settles in-flight events with ChannelClosedError when the channel closes mid-publish", async () => {
		const publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory(), {
			eventConfirmTimeoutMs: 5_000,
		});
		await publisher.connect();
		try {
			const internal = publisher as unknown as {
				channel: ConfirmChannel | null;
				inflight: Map<string, { settle: (err?: Error) => void }>;
			};
			// Insert a synthetic inflight entry whose settle callback we can observe.
			let settledWith: Error | undefined;
			internal.inflight.set("synthetic-1", {
				settle: (err) => {
					settledWith = err;
				},
			});
			await internal.channel?.close();
			// Allow microtasks for ch.on('close') to fire.
			await new Promise((r) => setTimeout(r, 50));
			expect(settledWith).toBeInstanceOf(ChannelClosedError);
		} finally {
			await publisher.close();
		}
	});

	it("emits handler-error on the channel when a user close handler throws", async () => {
		const publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory());
		await publisher.connect();
		const internal = publisher as unknown as { channel: ConfirmChannel | null };
		const ch = internal.channel;
		if (!ch) throw new Error("expected live channel");
		let captured: { err: Error; eventName: string } | null = null;
		ch.on("handler-error", (err: Error, eventName: string) => {
			captured = { err, eventName };
		});
		ch.on("close", () => {
			throw new Error("intentional close-handler throw");
		});
		try {
			await ch.close();
		} catch {}
		await new Promise((r) => setTimeout(r, 50));
		expect(captured).not.toBeNull();
		expect((captured as unknown as { eventName: string } | null)?.eventName).toBe("close");
		await publisher.close();
	});

	it("emits handler-error on the channel when a return handler throws", async () => {
		const publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory());
		await publisher.connect();
		const internal = publisher as unknown as { channel: ConfirmChannel | null };
		const ch = internal.channel;
		if (!ch) throw new Error("expected live channel");
		let captured: { err: Error; eventName: string } | null = null;
		ch.on("handler-error", (err: Error, eventName: string) => {
			captured = { err, eventName };
		});
		ch.on("return", () => {
			throw new Error("intentional return-handler throw");
		});
		// Publish with mandatory=true on an unbound routing key on the events exchange → broker returns.
		await publisher.publishExportFailed({ jobId: "no-bind-handler-error", error: "n/a" });
		await new Promise((r) => setTimeout(r, 100));
		expect(captured).not.toBeNull();
		expect((captured as unknown as { eventName: string } | null)?.eventName).toBe("return");
		await publisher.close();
	});
});
