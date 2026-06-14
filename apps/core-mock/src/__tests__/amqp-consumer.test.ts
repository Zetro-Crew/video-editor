import { RabbitMQContainer } from "@testcontainers/rabbitmq";
import {
	type Envelope,
	EXCHANGE_NAME,
	EXPORT_FAILED,
	EXPORT_FAILED_V1,
	type ExportFailedData,
	X_EVENT_NAME,
	X_EVENT_VERSION,
} from "@video-editor/contract/events";
import { type ChannelModel, type ConfirmChannel, connect } from "amqplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ExportConsumerHandle, startExportConsumer } from "../amqp-consumer.ts";
import { ExportResultStore } from "../export-result-store.ts";

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

describe("core-mock export consumer — drains all export.* keys", { timeout: 60_000 }, () => {
	let publisherConn: ChannelModel;
	let channel: ConfirmChannel;
	let consumer: ExportConsumerHandle;

	beforeAll(async () => {
		consumer = await startExportConsumer(amqpUrl, new ExportResultStore());

		publisherConn = await connect(amqpUrl);
		channel = await publisherConn.createConfirmChannel();
		await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
	});

	afterAll(async () => {
		await channel?.close();
		await publisherConn?.close();
		await consumer?.stop();
	});

	function publishWithReturnCapture(
		routingKey: string,
		envelope: Envelope<ExportFailedData>,
	): Promise<{ returned: boolean }> {
		return new Promise((resolve, reject) => {
			let returned = false;
			const onReturn = () => {
				returned = true;
			};
			channel.once("return", onReturn);
			channel.publish(
				EXCHANGE_NAME,
				routingKey,
				Buffer.from(JSON.stringify(envelope)),
				{
					contentType: "application/json",
					persistent: true,
					mandatory: true,
					headers: {
						[X_EVENT_NAME]: envelope.eventName,
						[X_EVENT_VERSION]: envelope.eventVersion,
					},
				},
				(err) => {
					channel.removeListener("return", onReturn);
					if (err) reject(err);
					else resolve({ returned });
				},
			);
		});
	}

	it("export.failed publish is routed (not returned) when consumer is bound", async () => {
		const envelope: Envelope<ExportFailedData> = {
			eventName: EXPORT_FAILED,
			eventVersion: EXPORT_FAILED_V1,
			occurredAt: new Date().toISOString(),
			data: { jobId: "test-job", error: "invalid envelope" },
		};
		const { returned } = await publishWithReturnCapture(EXPORT_FAILED, envelope);
		expect(returned).toBe(false);
	});
});
