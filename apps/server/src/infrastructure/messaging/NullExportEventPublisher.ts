import type {
	ExportCompletedEvent,
	ExportEventPublisherPort,
	ExportFailedEvent,
	ExportStartedEvent,
} from "./RabbitMQPublisher.ts";

export class NullExportEventPublisher implements ExportEventPublisherPort {
	async publishExportStarted(_event: ExportStartedEvent): Promise<void> {}
	async publishExportCompleted(_event: ExportCompletedEvent): Promise<void> {}
	async publishExportFailed(_event: ExportFailedEvent): Promise<void> {}
}
