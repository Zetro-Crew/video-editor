import { promises as fsp } from "node:fs";
import { performance } from "node:perf_hooks";
import { addCustomSpan, Logger, metricsService } from "@ztube/observability";

type HistogramAttrs = Record<string, string | number | boolean>;
type SpanAttrs = Record<string, string | number | boolean | string[] | number[]>;
// `addCustomSpan`'s callback supplies a Span — re-derive the parameter type
// from the call signature to avoid pulling @opentelemetry/api into apps/server's
// direct dep graph (the SDK already pins a compatible version).
type SpanArg = Parameters<Parameters<typeof addCustomSpan>[1]>[0];

import type { CommonEnvConfig } from "../../config/env.ts";
import type { PhaseOutcome } from "../../features/render/domain/render-outcome.ts";
import type { StoragePort } from "../../shared/application/ports/outbound/StoragePort.ts";
import type {
	RenderJob,
	RenderResult,
	VideoRenderPort,
} from "../../shared/application/ports/outbound/VideoRenderPort.ts";
import { createTempDir } from "../../shared/utils/file.utils.ts";
import { extractSegments, finalRenderToS3 } from "./FfmpegVideoProcessor.ts";
import type { FfmpegRunner } from "./ffmpeg.utils.ts";
import { prepareOverlays } from "./overlays/overlay.service.ts";
import { prepareWatermarkLogo } from "./overlays/watermark.service.ts";
import { prepareAudioSources } from "./source-processors/audio-process.ts";
import { processSources } from "./source-processors/process-sources.ts";

async function timedPhase<T>(
	spanName: string,
	metricName: string,
	histogramAttrs: HistogramAttrs,
	fn: (span: SpanArg) => Promise<T>,
): Promise<T> {
	const start = performance.now();
	let outcome: PhaseOutcome = "failed";
	try {
		const result = await addCustomSpan(spanName, async (span) => {
			try {
				const r = await fn(span);
				return r;
			} finally {
				// Record outcome on the span before the SDK ends it so failure traces
				// carry the same outcome attribute as the histogram.
				span.setAttribute("render.outcome", outcome === "completed" ? "completed" : "failed");
			}
		});
		outcome = "completed";
		return result;
	} finally {
		metricsService.recordHistogram(metricName, performance.now() - start, {
			...histogramAttrs,
			outcome,
		});
	}
}

export class FfmpegVideoProcessingAdapter implements VideoRenderPort {
	private readonly storage: StoragePort;
	private readonly config: CommonEnvConfig;
	private readonly runner: FfmpegRunner;

	constructor(storage: StoragePort, config: CommonEnvConfig, runner: FfmpegRunner) {
		this.storage = storage;
		this.config = config;
		this.runner = runner;
	}

	async render(job: RenderJob): Promise<RenderResult> {
		const tempDir = await createTempDir("render-");
		Logger.logInfo("[ffmpeg] render started", { s3Key: job.s3Key, format: job.format, tempDir });

		try {
			const sourcesStart = performance.now();
			const sourcePath = await timedPhase(
				"render.phase.sources",
				"render.phase.sources.duration_ms",
				{},
				async (span) => {
					span.setAttributes({
						"render.source_count": job.sources.length,
						"render.source_types": Array.from(new Set(job.sources.map((s) => s.type)))
							.sort()
							.join(","),
					});
					return processSources(
						job.sources,
						tempDir,
						this.storage,
						this.config,
						this.runner,
						job.signal,
					);
				},
			);
			Logger.logInfo("[ffmpeg] sources processed", {
				durationMs: performance.now() - sourcesStart,
			});
			void job.onProgress?.(10);

			const segmentsStart = performance.now();
			const segmentPaths = await timedPhase(
				"render.phase.segments",
				"render.phase.segments.duration_ms",
				{},
				async (span) => {
					span.setAttribute("render.keep_segment_count", job.keepSegments.length);
					const paths = await extractSegments(
						sourcePath,
						job.keepSegments,
						tempDir,
						this.config,
						this.runner,
						job.signal,
					);
					span.setAttribute("render.segment_count", paths.length);
					return paths;
				},
			);
			Logger.logInfo("[ffmpeg] segments extracted", {
				count: segmentPaths.length,
				durationMs: performance.now() - segmentsStart,
			});
			void job.onProgress?.(20);

			const overlaysAudioStart = performance.now();
			const [{ overlayInputs, hasOverlays }, { audioPaths, hasAudio }, wmLogoPath] =
				await timedPhase(
					"render.phase.overlays_audio",
					"render.phase.overlays_audio.duration_ms",
					{},
					async (span) => {
						span.setAttributes({
							"render.overlay_count": job.overlays.length,
							"render.audio_source_count": job.audioSources.length,
						});
						const out = await Promise.all([
							prepareOverlays(
								job.overlays,
								tempDir,
								this.storage,
								this.config,
								this.runner,
								job.signal,
							),
							prepareAudioSources(
								job.audioSources,
								tempDir,
								job.totalDuration,
								this.storage,
								this.config,
								this.runner,
								job.signal,
							),
							prepareWatermarkLogo(),
						]);
						span.setAttributes({
							"render.has_overlays": out[0].hasOverlays,
							"render.has_audio": out[1].hasAudio,
						});
						return out;
					},
				);
			Logger.logInfo("[ffmpeg] overlays+audio prepared", {
				hasOverlays,
				hasAudio,
				durationMs: performance.now() - overlaysAudioStart,
			});
			void job.onProgress?.(30);

			const finalStart = performance.now();
			const result = await timedPhase(
				"render.phase.final",
				"render.phase.final.duration_ms",
				{ format: job.format },
				async (span) => {
					const attrs: SpanAttrs = {
						"render.format": job.format,
						"render.total_duration_ms": job.totalDuration,
					};
					if (job.frameTimeMs !== undefined) {
						attrs["render.frame_time_ms"] = job.frameTimeMs;
					}
					span.setAttributes(attrs);
					return finalRenderToS3(
						segmentPaths,
						overlayInputs,
						job.overlays,
						job.keepSegments,
						job.totalDuration,
						hasOverlays,
						job.sources,
						tempDir,
						job.format,
						audioPaths,
						hasAudio,
						job.audioMixMode,
						job.frameTimeMs,
						job.s3Key,
						this.storage,
						this.config,
						this.runner,
						this.config.RENDER_URL_EXPIRY_SECONDS,
						job.onProgress
							? (p: number) => void job.onProgress?.(30 + Math.round(p * 0.7))
							: undefined,
						job.cropRegion,
						job.signal,
						wmLogoPath,
					);
				},
			);
			Logger.logInfo("[ffmpeg] render uploaded to S3", {
				s3Key: job.s3Key,
				durationMs: performance.now() - finalStart,
			});
			return result;
		} finally {
			await fsp.rm(tempDir, { recursive: true, force: true });
			Logger.logInfo("[ffmpeg] temp dir cleaned up", { tempDir });
		}
	}
}
