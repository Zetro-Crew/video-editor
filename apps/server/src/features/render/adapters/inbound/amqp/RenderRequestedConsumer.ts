import { Logger } from "@ztube/observability";
import type { ConsumeMessage } from "amqplib";
import type { MonitorFactory } from "../../../../../infrastructure/messaging/MonitorFactory.ts";
import type { ExportEventPublisherPort } from "../../../../../infrastructure/messaging/RabbitMQPublisher.ts";
import {
	type RenderRequestedData,
	renderRequestedEnvelopeSchema,
} from "../../../../../infrastructure/messaging/schemas/commands.ts";
import type { StoragePort } from "../../../../../shared/application/ports/outbound/StoragePort.ts";
import type { VideoRenderUseCase } from "../../../application/use-cases/VideoRenderUseCase.ts";
import { getRenderOutputKey, getRenderProbeKey } from "../../../domain/output-key.ts";

export interface AckChannel {
	ack(msg: ConsumeMessage): void;
	nack(msg: ConsumeMessage, allUpTo: boolean, requeue: boolean): void;
}

export interface RenderRequestedConsumerDeps {
	storage: StoragePort;
	videoRenderUseCase: VideoRenderUseCase;
	exportPublisher: ExportEventPublisherPort;
	monitorFactory: MonitorFactory;
	s3OutputPrefix: string;
	renderUrlExpirySeconds: number;
}

function bestEffortJobIdFromRaw(content: Buffer): string | undefined {
	const text = content.toString("utf8");
	try {
		const parsed = JSON.parse(text) as unknown;
		const data =
			parsed && typeof parsed === "object" && "data" in parsed
				? (parsed as { data?: unknown }).data
				: undefined;
		if (data && typeof data === "object" && "jobId" in data) {
			const id = (data as { jobId?: unknown }).jobId;
			if (typeof id === "string" && id.length > 0) return id;
		}
	} catch {}
	const match = text.match(/"jobId"\s*:\s*"([^"]+)"/);
	return match?.[1];
}

function getDeliveryCount(msg: ConsumeMessage): number {
	const raw = msg.properties.headers?.["x-delivery-count"];
	return typeof raw === "number" ? raw : 0;
}

export class RenderRequestedConsumer {
	private readonly storage: StoragePort;
	private readonly videoRenderUseCase: VideoRenderUseCase;
	private readonly exportPublisher: ExportEventPublisherPort;
	private readonly monitorFactory: MonitorFactory;
	private readonly s3OutputPrefix: string;
	private readonly renderUrlExpirySeconds: number;

	constructor(deps: RenderRequestedConsumerDeps) {
		this.storage = deps.storage;
		this.videoRenderUseCase = deps.videoRenderUseCase;
		this.exportPublisher = deps.exportPublisher;
		this.monitorFactory = deps.monitorFactory;
		this.s3OutputPrefix = deps.s3OutputPrefix;
		this.renderUrlExpirySeconds = deps.renderUrlExpirySeconds;
	}

	// Best-effort terminal publish on poison messages. Must not throw — caller
	// ALWAYS acks afterwards, so we don't want a publish failure to bubble up
	// and trigger nack-requeue (which would re-deliver the poison forever).
	private async tryPublishPoisonFailed(jobId: string): Promise<void> {
		try {
			await this.exportPublisher.publishExportFailed({ jobId, error: "invalid envelope" });
		} catch (err) {
			Logger.logError(
				"[render-consumer] poison export.failed publish errored — acking anyway",
				err instanceof Error ? err : new Error(String(err)),
				{ jobId },
			);
		}
	}

	async handle(msg: ConsumeMessage, channel: AckChannel): Promise<void> {
		const rawJobId = bestEffortJobIdFromRaw(msg.content);

		let envelopeUnknown: unknown;
		try {
			envelopeUnknown = JSON.parse(msg.content.toString("utf8"));
		} catch (err) {
			Logger.logError(
				"[render-consumer] envelope JSON parse failed",
				err instanceof Error ? err : new Error(String(err)),
				{ jobId: rawJobId },
			);
			if (rawJobId) {
				await this.tryPublishPoisonFailed(rawJobId);
			}
			channel.ack(msg);
			return;
		}

		const parsed = renderRequestedEnvelopeSchema.safeParse(envelopeUnknown);
		if (!parsed.success) {
			Logger.logWarning("[render-consumer] envelope schema invalid — dropping", {
				jobId: rawJobId,
				issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
			});
			if (rawJobId) {
				await this.tryPublishPoisonFailed(rawJobId);
			}
			channel.ack(msg);
			return;
		}

		const data = parsed.data.data;
		const jobId = data.jobId;
		const deliveryCount = getDeliveryCount(msg);
		const monitor = this.monitorFactory(
			{ processName: "amqp-consume", stageName: "render.requested", businessId: jobId },
			{ eventVersion: parsed.data.eventVersion },
		);
		monitor.logStarted();

		const outputKey = getRenderOutputKey(this.s3OutputPrefix, jobId, data.format);
		const probeKey = getRenderProbeKey(this.s3OutputPrefix, jobId, data.format);

		try {
			const alreadyDone = await this.storage.exists(probeKey);
			if (alreadyDone) {
				const url = await this.storage.getPresignedUrl(outputKey, this.renderUrlExpirySeconds);
				await this.exportPublisher.publishExportCompleted({
					jobId,
					url,
					exportType: data.exportType,
				});
				monitor.logSuccess();
				channel.ack(msg);
				return;
			}

			// Skip export.started on redelivery so retries don't fan out duplicate
			// "started" events. quorum queues bump x-delivery-count on every requeue.
			if (data.saveMetadata && deliveryCount === 0) {
				await this.exportPublisher.publishExportStarted({
					jobId,
					exportType: data.exportType,
					mediaId: data.saveMetadata.mediaId,
					mediaName: data.saveMetadata.mediaName,
					downloadToComputer: data.saveMetadata.downloadToComputer,
					saveToPersonalChannel: data.saveMetadata.saveToPersonalChannel,
					selectedUnitChannelIds: data.saveMetadata.selectedUnitChannelIds,
					items: data.saveMetadata.items,
				});
			}

			const result = await this.videoRenderUseCase.execute(toRenderInput(data), outputKey);

			await this.exportPublisher.publishExportCompleted({
				jobId,
				url: result.url,
				exportType: data.exportType,
			});
			monitor.logSuccess();
			channel.ack(msg);
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			Logger.logError("[render-consumer] render failed — nack with requeue", error, {
				jobId,
				deliveryCount,
			});
			monitor.logRetry(error);
			channel.nack(msg, false, true);
		}
	}
}

function toRenderInput(data: RenderRequestedData): {
	sources: RenderRequestedData["sources"];
	trimEnd: number;
	cuts: RenderRequestedData["cuts"];
	overlays: RenderRequestedData["overlays"];
	audioSources: RenderRequestedData["audioSources"];
	audioMixMode: RenderRequestedData["audioMixMode"];
	format: RenderRequestedData["format"];
	frameTimeMs?: number;
	cropRegion?: RenderRequestedData["cropRegion"];
} {
	return {
		sources: data.sources,
		trimEnd: data.trimEnd,
		cuts: data.cuts,
		overlays: data.overlays,
		audioSources: data.audioSources,
		audioMixMode: data.audioMixMode,
		format: data.format,
		frameTimeMs: data.frameTimeMs,
		cropRegion: data.cropRegion,
	};
}
