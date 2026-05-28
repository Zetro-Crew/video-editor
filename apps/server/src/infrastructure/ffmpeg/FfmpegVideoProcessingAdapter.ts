import { promises as fsp } from "node:fs";
import { Logger } from "@ztube/observability";
import type { EnvConfig } from "../../config/env.ts";
import type { StoragePort } from "../../shared/application/ports/outbound/StoragePort.ts";
import type {
	RenderJob,
	RenderResult,
	VideoRenderPort,
} from "../../shared/application/ports/outbound/VideoRenderPort.ts";
import { createTempDir } from "../../shared/utils/file.utils.ts";
import { extractSegments, finalRenderToS3 } from "./FfmpegVideoProcessor.ts";
import { prepareOverlays } from "./overlays/overlay.service.ts";
import { prepareWatermarkLogo } from "./overlays/watermark.service.ts";
import { prepareAudioSources } from "./source-processors/audio-process.ts";
import { processSources } from "./source-processors/process-sources.ts";

export class FfmpegVideoProcessingAdapter implements VideoRenderPort {
	private readonly storage: StoragePort;
	private readonly config: EnvConfig;

	constructor(storage: StoragePort, config: EnvConfig) {
		this.storage = storage;
		this.config = config;
	}

	async render(job: RenderJob): Promise<RenderResult> {
		const tempDir = await createTempDir("render-");
		Logger.logInfo("[ffmpeg] render started", { s3Key: job.s3Key, format: job.format, tempDir });

		try {
			let stageStart = Date.now();
			const sourcePath = await processSources(
				job.sources,
				tempDir,
				this.storage,
				this.config,
				job.signal,
			);
			Logger.logInfo("[ffmpeg] sources processed", { durationMs: Date.now() - stageStart });
			void job.onProgress?.(10);

			stageStart = Date.now();
			const segmentPaths = await extractSegments(
				sourcePath,
				job.keepSegments,
				tempDir,
				this.config,
				job.signal,
			);
			Logger.logInfo("[ffmpeg] segments extracted", {
				count: segmentPaths.length,
				durationMs: Date.now() - stageStart,
			});
			void job.onProgress?.(20);

			stageStart = Date.now();
			const [{ overlayInputs, hasOverlays }, { audioPaths, hasAudio }, wmLogoPath] =
				await Promise.all([
					prepareOverlays(job.overlays, tempDir, this.storage, this.config, job.signal),
					prepareAudioSources(
						job.audioSources,
						tempDir,
						job.totalDuration,
						this.storage,
						this.config,
						job.signal,
					),
					prepareWatermarkLogo(),
				]);
			Logger.logInfo("[ffmpeg] overlays+audio prepared", {
				hasOverlays,
				hasAudio,
				durationMs: Date.now() - stageStart,
			});
			void job.onProgress?.(30);

			stageStart = Date.now();
			const result = await finalRenderToS3(
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
				this.config.RENDER_URL_EXPIRY_SECONDS,
				job.onProgress ? (p: number) => void job.onProgress?.(30 + Math.round(p * 0.7)) : undefined,
				job.cropRegion,
				job.signal,
				wmLogoPath,
			);
			Logger.logInfo("[ffmpeg] render uploaded to S3", {
				s3Key: job.s3Key,
				durationMs: Date.now() - stageStart,
			});
			return result;
		} finally {
			await fsp.rm(tempDir, { recursive: true, force: true });
			Logger.logInfo("[ffmpeg] temp dir cleaned up", { tempDir });
		}
	}
}
