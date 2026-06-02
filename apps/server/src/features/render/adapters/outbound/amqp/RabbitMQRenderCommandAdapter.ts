import type { RabbitMQPublisher } from "../../../../../infrastructure/messaging/RabbitMQPublisher.ts";
import {
	RENDER_REQUESTED,
	RENDER_REQUESTED_V1,
	type RenderRequestedData,
} from "../../../../../infrastructure/messaging/schemas/commands.ts";
import type { RenderCommandPort } from "../../../application/ports/outbound/RenderCommandPort.ts";

export class RabbitMQRenderCommandAdapter implements RenderCommandPort {
	private readonly publisher: RabbitMQPublisher;

	constructor(publisher: RabbitMQPublisher) {
		this.publisher = publisher;
	}

	async enqueueRender(data: RenderRequestedData): Promise<void> {
		await this.publisher.publishCommand(RENDER_REQUESTED, RENDER_REQUESTED_V1, data.jobId, data);
	}
}
