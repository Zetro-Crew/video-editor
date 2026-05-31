import type {
	ExportCompletedData,
	ExportEventPublisherPort,
	ExportFailedData,
	ExportStartedData,
} from "./RabbitMQPublisher.ts";

export class NullExportEventPublisher implements ExportEventPublisherPort {
	async publishExportStarted(_event: ExportStartedData): Promise<void> {}
	async publishExportCompleted(_event: ExportCompletedData): Promise<void> {}
	async publishExportFailed(_event: ExportFailedData): Promise<void> {}
}
