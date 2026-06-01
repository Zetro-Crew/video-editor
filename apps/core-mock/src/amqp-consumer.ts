import { EXCHANGE_NAME, exportCompletedEnvelopeSchema } from "@video-editor/contract/events";
import { connect } from "amqplib";
import type { ExportResultStore } from "./export-result-store.ts";

export async function startExportConsumer(
	rabbitmqUrl: string,
	store: ExportResultStore,
): Promise<void> {
	const conn = await connect(rabbitmqUrl);
	const ch = await conn.createChannel();
	await ch.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
	const { queue } = await ch.assertQueue("", { exclusive: true, autoDelete: true });
	await ch.bindQueue(queue, EXCHANGE_NAME, "export.completed");
	ch.consume(queue, (msg) => {
		if (!msg) return;
		try {
			const envelope = exportCompletedEnvelopeSchema.parse(JSON.parse(msg.content.toString()));
			store.push({ ...envelope.data, occurredAt: envelope.occurredAt });
		} catch {
			// malformed message — ignore
		}
		ch.ack(msg);
	});
}
