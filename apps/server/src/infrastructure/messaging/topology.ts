import { EXCHANGE_NAME } from "@video-editor/contract/events";
import type { Channel, ConfirmChannel } from "amqplib";
import {
	COMMANDS_EXCHANGE,
	DLX_EXCHANGE,
	RENDER_DEAD_QUEUE,
	RENDER_REQUESTED,
	RENDER_REQUESTED_QUEUE,
} from "./schemas/commands.ts";

export interface RenderTopologyOptions {
	renderRequestTtlMs?: number;
	renderQueueMaxLength: number;
	renderDeliveryLimit: number;
}

// Single source of truth for exchange/queue declarations. Both the API
// publisher and the worker consumer call this — same args every time, or
// RabbitMQ returns PRECONDITION_FAILED on the second asserter.
export async function assertRenderTopology(
	ch: Channel | ConfirmChannel,
	options: RenderTopologyOptions,
): Promise<void> {
	await ch.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
	await ch.assertExchange(COMMANDS_EXCHANGE, "direct", { durable: true });
	await ch.assertExchange(DLX_EXCHANGE, "direct", { durable: true });
	await ch.assertQueue(RENDER_DEAD_QUEUE, { durable: true });
	await ch.bindQueue(RENDER_DEAD_QUEUE, DLX_EXCHANGE, RENDER_REQUESTED);
	const renderArgs: Record<string, unknown> = {
		"x-queue-type": "quorum",
		"x-delivery-limit": options.renderDeliveryLimit,
		"x-overflow": "reject-publish",
		"x-max-length": options.renderQueueMaxLength,
		"x-dead-letter-exchange": DLX_EXCHANGE,
		"x-dead-letter-routing-key": RENDER_REQUESTED,
	};
	if (typeof options.renderRequestTtlMs === "number") {
		renderArgs["x-message-ttl"] = options.renderRequestTtlMs;
	}
	await ch.assertQueue(RENDER_REQUESTED_QUEUE, {
		durable: true,
		arguments: renderArgs,
	});
	await ch.bindQueue(RENDER_REQUESTED_QUEUE, COMMANDS_EXCHANGE, RENDER_REQUESTED);
}
