import type { ConsumeMessage } from "amqplib";
import { describe, expect, it, vi } from "vitest";
import { createNoopMonitorFactory } from "../../../../../../infrastructure/messaging/createNoopMonitorFactory.ts";
import type { ExportEventPublisherPort } from "../../../../../../infrastructure/messaging/RabbitMQPublisher.ts";
import { RenderDLQConsumer } from "../RenderDLQConsumer.ts";

function makeMsg(body: unknown): ConsumeMessage {
	return {
		content: Buffer.from(typeof body === "string" ? body : JSON.stringify(body)),
		fields: { routingKey: "render.requested" } as ConsumeMessage["fields"],
		properties: {} as ConsumeMessage["properties"],
	} as ConsumeMessage;
}

function makePublisher(): ExportEventPublisherPort & {
	publishExportFailed: ReturnType<typeof vi.fn>;
	publishExportStarted: ReturnType<typeof vi.fn>;
	publishExportCompleted: ReturnType<typeof vi.fn>;
} {
	return {
		publishExportFailed: vi.fn().mockResolvedValue(undefined),
		publishExportStarted: vi.fn().mockResolvedValue(undefined),
		publishExportCompleted: vi.fn().mockResolvedValue(undefined),
	};
}

describe("RenderDLQConsumer", () => {
	it("publishes export.failed 'max retries exceeded' and acks", async () => {
		const publisher = makePublisher();
		const consumer = new RenderDLQConsumer({
			exportPublisher: publisher,
			monitorFactory: createNoopMonitorFactory(),
		});
		const channel = { ack: vi.fn(), nack: vi.fn() };
		const msg = makeMsg({ data: { jobId: "dead-1" } });

		await consumer.handle(msg, channel);

		expect(publisher.publishExportFailed).toHaveBeenCalledWith({
			jobId: "dead-1",
			error: "max retries exceeded",
		});
		expect(channel.ack).toHaveBeenCalledWith(msg);
		expect(channel.nack).not.toHaveBeenCalled();
	});

	it("extracts jobId via regex when JSON is malformed", async () => {
		const publisher = makePublisher();
		const consumer = new RenderDLQConsumer({
			exportPublisher: publisher,
			monitorFactory: createNoopMonitorFactory(),
		});
		const channel = { ack: vi.fn(), nack: vi.fn() };
		const msg = makeMsg('{"data":{"jobId":"dead-2"},broken');

		await consumer.handle(msg, channel);

		expect(publisher.publishExportFailed).toHaveBeenCalledWith(
			expect.objectContaining({ jobId: "dead-2", error: "max retries exceeded" }),
		);
		expect(channel.ack).toHaveBeenCalled();
	});

	it("acks without publishing when jobId not recoverable", async () => {
		const publisher = makePublisher();
		const consumer = new RenderDLQConsumer({
			exportPublisher: publisher,
			monitorFactory: createNoopMonitorFactory(),
		});
		const channel = { ack: vi.fn(), nack: vi.fn() };
		const msg = makeMsg("not-json");

		await consumer.handle(msg, channel);

		expect(publisher.publishExportFailed).not.toHaveBeenCalled();
		expect(channel.ack).toHaveBeenCalled();
	});

	it("acks even when publishExportFailed throws (best-effort)", async () => {
		const publisher = makePublisher();
		publisher.publishExportFailed.mockRejectedValueOnce(new Error("broker down"));
		const consumer = new RenderDLQConsumer({
			exportPublisher: publisher,
			monitorFactory: createNoopMonitorFactory(),
		});
		const channel = { ack: vi.fn(), nack: vi.fn() };
		const msg = makeMsg({ data: { jobId: "dead-3" } });

		await consumer.handle(msg, channel);

		expect(channel.ack).toHaveBeenCalled();
	});
});
