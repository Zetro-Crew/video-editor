import { RabbitMQContainer } from "@testcontainers/rabbitmq";
import { EXCHANGE_NAME, EXPORT_COMPLETED } from "@video-editor/contract/events";
import { Logger } from "@ztube/observability";
import { connect } from "amqplib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createNoopMonitorFactory } from "../createNoopMonitorFactory.ts";
import { RabbitMQPublisher } from "../RabbitMQPublisher.ts";

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

// Reach into the recovery wrapper to force a connection drop without stopping the broker.
// Mirrors a transient broker close — the wrapper observes the underlying close, emits
// disconnect, schedules reconnect, and re-runs setup.
function forceConnectionDrop(publisher: RabbitMQPublisher): Promise<void> {
	const inner = (
		publisher as unknown as {
			model: { _core: { _model: { close: () => Promise<void> } } } | null;
		}
	).model;
	if (!inner) throw new Error("publisher has no model");
	return inner._core._model.close();
}

describe("RabbitMQPublisher — built-in recovery", { timeout: 60_000 }, () => {
	it("recovers after a connection drop and resumes publishing", async () => {
		const teardown = await (async () => {
			const conn = await connect(amqpUrl);
			conn.on("error", () => {});
			const ch = await conn.createChannel();
			ch.on("error", () => {});
			await ch.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
			const { queue } = await ch.assertQueue("", { exclusive: true });
			await ch.bindQueue(queue, EXCHANGE_NAME, EXPORT_COMPLETED);
			await ch.consume(queue, () => {}, { noAck: true });
			return async () => {
				try {
					await ch.close();
				} catch {}
				try {
					await conn.close();
				} catch {}
			};
		})();

		const infoSpy = vi.spyOn(Logger, "logInfo").mockImplementation(() => {});
		const publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory(), {
			recoveryMaxDelayMs: 1_500,
		});
		try {
			await publisher.connect();
			await forceConnectionDrop(publisher);

			const start = Date.now();
			while (Date.now() - start < 10_000) {
				const recovered = infoSpy.mock.calls.some((args) => args[0] === "amqp_publisher_recovered");
				if (recovered) break;
				await new Promise((r) => setTimeout(r, 50));
			}
			expect(infoSpy.mock.calls.some((args) => args[0] === "amqp_publisher_recovered")).toBe(true);

			await publisher.publishExportCompleted({
				jobId: "post-recovery",
				url: "https://s3.example.com/recovered.mp4",
				exportType: "mp4",
			});
		} finally {
			infoSpy.mockRestore();
			await publisher.close();
			await teardown();
		}
	});

	it("close() after a connection drop tears down without leaking reconnect activity", async () => {
		const publisher = new RabbitMQPublisher(amqpUrl, createNoopMonitorFactory(), {
			recoveryMaxDelayMs: 1_500,
		});
		await publisher.connect();
		await forceConnectionDrop(publisher);
		await publisher.close();
		// Give any in-flight recovery scheduling a chance to fire after close — it must not.
		const warnSpy = vi.spyOn(Logger, "logWarning").mockImplementation(() => {});
		try {
			await new Promise((r) => setTimeout(r, 500));
			const reconnectAfterClose = warnSpy.mock.calls.filter(
				(args) => args[0] === "amqp_publisher_reconnect_scheduled",
			);
			expect(reconnectAfterClose).toHaveLength(0);
		} finally {
			warnSpy.mockRestore();
		}
	});
});
