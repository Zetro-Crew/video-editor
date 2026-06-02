import { Logger } from "@ztube/observability";
import type { ConsumeMessage } from "amqplib";
import type { MonitorFactory } from "../../../../../infrastructure/messaging/MonitorFactory.ts";
import type { ExportEventPublisherPort } from "../../../../../infrastructure/messaging/RabbitMQPublisher.ts";
import type { AckChannel } from "./RenderRequestedConsumer.ts";

const MAX_RETRIES_ERROR = "max retries exceeded";

export interface RenderDLQConsumerDeps {
	exportPublisher: ExportEventPublisherPort;
	monitorFactory: MonitorFactory;
}

function extractJobId(content: Buffer): string | undefined {
	const text = content.toString("utf8");
	try {
		const parsed = JSON.parse(text) as { data?: { jobId?: unknown } } | unknown;
		if (parsed && typeof parsed === "object" && "data" in parsed) {
			const id = (parsed as { data?: { jobId?: unknown } }).data?.jobId;
			if (typeof id === "string" && id.length > 0) return id;
		}
	} catch {}
	const match = text.match(/"jobId"\s*:\s*"([^"]+)"/);
	return match?.[1];
}

export class RenderDLQConsumer {
	private readonly exportPublisher: ExportEventPublisherPort;
	private readonly monitorFactory: MonitorFactory;

	constructor(deps: RenderDLQConsumerDeps) {
		this.exportPublisher = deps.exportPublisher;
		this.monitorFactory = deps.monitorFactory;
	}

	async handle(msg: ConsumeMessage, channel: AckChannel): Promise<void> {
		const jobId = extractJobId(msg.content);
		if (!jobId) {
			Logger.logWarning("[render-dlq] message had no recoverable jobId — dropping", {
				routingKey: msg.fields.routingKey,
			});
			channel.ack(msg);
			return;
		}

		const monitor = this.monitorFactory({
			processName: "amqp-consume",
			stageName: "render.dead",
			businessId: jobId,
		});
		monitor.logStarted();

		try {
			await this.exportPublisher.publishExportFailed({
				jobId,
				error: MAX_RETRIES_ERROR,
			});
			monitor.logSuccess();
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			Logger.logError("[render-dlq] failed to publish export.failed", error, { jobId });
			monitor.logAborting(error);
		}
		channel.ack(msg);
	}
}
