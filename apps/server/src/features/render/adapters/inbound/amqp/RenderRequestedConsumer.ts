import { performance } from "node:perf_hooks";
import { addCustomSpan, Logger, metricsService } from "@ztube/observability";

type HistogramAttrs = Record<string, string | number | boolean>;

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
import type { PhaseOutcome, RenderOutcome } from "../../../domain/render-outcome.ts";

async function timed<T>(
	metricName: string,
	baseAttrs: HistogramAttrs,
	fn: () => Promise<T>,
): Promise<T> {
	const start = performance.now();
	let outcome: PhaseOutcome = "failed";
	try {
		const result = await fn();
		outcome = "completed";
		return result;
	} finally {
		metricsService.recordHistogram(metricName, performance.now() - start, {
			...baseAttrs,
			outcome,
		});
	}
}

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
			const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
			Logger.logError(
				"[render-consumer] envelope schema invalid — dropping",
				new Error(issues.join("; ")),
				{ jobId: rawJobId, issues },
			);
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

		const jobStart = performance.now();
		let outcome: RenderOutcome = "failed";
		try {
			await addCustomSpan("render.job", async (span) => {
				span.setAttributes({
					"render.job_id": jobId,
					"render.format": data.format,
					"render.export_type": data.exportType,
					"amqp.delivery_count": deliveryCount,
				});

				try {
					const alreadyDone = await timed("render.idempotency_probe.duration_ms", {}, () =>
						addCustomSpan("render.idempotency_probe", async (probeSpan) => {
							probeSpan.setAttribute("s3.key", probeKey);
							const hit = await this.storage.exists(probeKey);
							probeSpan.setAttribute("result.hit", hit);
							return hit;
						}),
					);

					if (alreadyDone) {
						const url = await this.storage.getPresignedUrl(outputKey, this.renderUrlExpirySeconds);
						await timed("render.publish.duration_ms", { event: "export.completed" }, () =>
							addCustomSpan("render.publish.export_completed", async (pubSpan) => {
								pubSpan.setAttributes({
									"messaging.message.name": "export.completed",
									"render.idempotent_hit": true,
								});
								await this.exportPublisher.publishExportCompleted({
									jobId,
									url,
									exportType: data.exportType,
								});
							}),
						);
						channel.ack(msg);
						outcome = "idempotent_hit";
						monitor.logSuccess();
						return;
					}

					// Skip export.started on redelivery so retries don't fan out duplicate
					// "started" events. quorum queues bump x-delivery-count on every requeue.
					const saveMetadata = data.saveMetadata;
					if (saveMetadata && deliveryCount === 0) {
						await timed("render.publish.duration_ms", { event: "export.started" }, () =>
							addCustomSpan("render.publish.export_started", async (pubSpan) => {
								pubSpan.setAttribute("messaging.message.name", "export.started");
								await this.exportPublisher.publishExportStarted({
									jobId,
									exportType: data.exportType,
									mediaId: saveMetadata.mediaId,
									mediaName: saveMetadata.mediaName,
									downloadToComputer: saveMetadata.downloadToComputer,
									saveToPersonalChannel: saveMetadata.saveToPersonalChannel,
									selectedUnitChannelIds: saveMetadata.selectedUnitChannelIds,
									items: saveMetadata.items,
								});
							}),
						);
					}

					const result = await this.videoRenderUseCase.execute(toRenderInput(data), outputKey);

					await timed("render.publish.duration_ms", { event: "export.completed" }, () =>
						addCustomSpan("render.publish.export_completed", async (pubSpan) => {
							pubSpan.setAttributes({
								"messaging.message.name": "export.completed",
								"render.idempotent_hit": false,
							});
							await this.exportPublisher.publishExportCompleted({
								jobId,
								url: result.url,
								exportType: data.exportType,
							});
						}),
					);
					channel.ack(msg);
					outcome = "completed";
					monitor.logSuccess();
				} finally {
					// Recorded even on throw so the span carries the outcome attribute
					// for trace-side filtering; the histogram outcome is recorded by the
					// outer finally below.
					span.setAttribute("render.outcome", outcome);
				}
			});
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			Logger.logError("[render-consumer] render failed — nack with requeue", error, {
				jobId,
				deliveryCount,
			});
			monitor.logRetry(error);
			channel.nack(msg, false, true);
		} finally {
			metricsService.recordHistogram("render.job.duration_ms", performance.now() - jobStart, {
				outcome,
			});
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
