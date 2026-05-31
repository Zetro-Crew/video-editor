import { RabbitMQContainer } from "@testcontainers/rabbitmq";
import type { ConsumeMessage } from "amqplib";
import { connect } from "amqplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RabbitMQPublisher } from "../RabbitMQPublisher.ts";

describe("RabbitMQPublisher", { timeout: 60_000 }, () => {
	let amqpUrl: string;
	let publisher: RabbitMQPublisher;
	let stopContainer: () => Promise<void>;

	beforeAll(async () => {
		const container = await new RabbitMQContainer("rabbitmq:3-management").start();
		amqpUrl = container.getAmqpUrl();
		publisher = new RabbitMQPublisher(amqpUrl);
		stopContainer = async () => {
			await container.stop();
		};
	});

	afterAll(async () => {
		await publisher.close();
		await stopContainer?.();
	});

	// Returns a function that waits for the next message on the given routingKey.
	// The consumer is fully registered before this function returns, so it is safe to
	// publish immediately after awaiting setupConsumer.
	async function setupConsumer(routingKey: string): Promise<() => Promise<ConsumeMessage>> {
		const conn = await connect(amqpUrl);
		conn.on("error", () => {});
		conn.on("close", () => {});
		const ch = await conn.createChannel();
		ch.on("error", () => {});
		ch.on("close", () => {});
		await ch.assertExchange("video-editor", "topic", { durable: true });
		const { queue } = await ch.assertQueue("", { exclusive: true });
		await ch.bindQueue(queue, "video-editor", routingKey);

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

	it("publishExportStarted sends to exchange with routing key export.started", async () => {
		const collect = await setupConsumer("export.started");
		await publisher.publishExportStarted({
			jobId: "j1",
			mediaName: "clip",
			downloadToComputer: true,
			saveToPersonalChannel: false,
			selectedChannelIds: ["ch1"],
			exportType: "mp4",
			items: [{ id: "item1" }],
		});
		const msg = await collect();
		const content = JSON.parse(msg.content.toString()) as Record<string, unknown>;
		expect(msg.fields.routingKey).toBe("export.started");
		expect(content.jobId).toBe("j1");
		expect(content.mediaName).toBe("clip");
		expect(content.exportType).toBe("mp4");
	});

	it("publishExportCompleted sends url and exportType", async () => {
		const collect = await setupConsumer("export.completed");
		await publisher.publishExportCompleted({
			jobId: "j2",
			url: "https://s3.example.com/out.mp4",
			exportType: "mp4",
		});
		const msg = await collect();
		const content = JSON.parse(msg.content.toString()) as Record<string, unknown>;
		expect(msg.fields.routingKey).toBe("export.completed");
		expect(content.jobId).toBe("j2");
		expect(content.url).toBe("https://s3.example.com/out.mp4");
	});

	it("publishExportFailed sends error string", async () => {
		const collect = await setupConsumer("export.failed");
		await publisher.publishExportFailed({ jobId: "j3", error: "ffmpeg segfault" });
		const msg = await collect();
		const content = JSON.parse(msg.content.toString()) as Record<string, unknown>;
		expect(msg.fields.routingKey).toBe("export.failed");
		expect(content.error).toBe("ffmpeg segfault");
	});
});
