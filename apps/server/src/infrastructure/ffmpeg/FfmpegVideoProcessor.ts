import fs, { existsSync, promises as fsp } from "node:fs";
import path from "node:path";
import type { Overlay, VideoSource } from "@video-editor/contract/internal/edit-video";
import type { TimeRange } from "@video-editor/contract/internal/shared";
import sharp from "sharp";
import type { CommonEnvConfig } from "../../config/env.ts";
import type { StoragePort } from "../../shared/application/ports/outbound/StoragePort.ts";
import { normalizeFfmpegDuration, normalizeFfmpegTime } from "../../shared/utils/time.utils.ts";
import { FFMPEG_COMMAND, FFMPEG_FLAG } from "./ffmpeg.consts.ts";
import { type FfmpegRunner, hasAudioStream } from "./ffmpeg.utils.ts";
import { FfmpegCommandBuilder } from "./ffmpeg-command.builder.ts";
import type { PreparedOverlayInput } from "./overlays/overlay.service.ts";

const FFMPEG_PREFLIGHT_CONCAT = process.env.FFMPEG_PREFLIGHT_CONCAT !== "0";

export async function extractSegments(
	sourcePath: string,
	keepSegments: TimeRange[],
	tempDir: string,
	config: CommonEnvConfig,
	runner: FfmpegRunner,
	signal?: AbortSignal,
): Promise<string[]> {
	return Promise.all(
		keepSegments.map(async (segment, index) => {
			const segmentPath = path.join(tempDir, `segment-${index}.mp4`);
			const seekTime = String(normalizeFfmpegTime(segment.start));
			const duration = String(normalizeFfmpegDuration(segment.end - segment.start));

			const args = [
				FFMPEG_FLAG.SEEK_INPUT,
				seekTime,
				FFMPEG_FLAG.INPUT,
				sourcePath,
				FFMPEG_FLAG.DURATION,
				duration,
				FFMPEG_FLAG.VIDEO_CODEC,
				FFMPEG_COMMAND.H264_VIDEO_CODEC,
				FFMPEG_FLAG.ENCODING_PRESET,
				config.FFMPEG_PRESET,
				FFMPEG_FLAG.CRF,
				config.FFMPEG_CRF,
				FFMPEG_FLAG.PIXEL_FORMAT,
				"yuv420p",
				FFMPEG_FLAG.AUDIO_CODEC,
				FFMPEG_COMMAND.AAC_AUDIO_CODEC,
				FFMPEG_COMMAND.HIDE_BANNER,
				FFMPEG_COMMAND.OVERWRITE_OUTPUT,
				...FFMPEG_COMMAND.AVOID_NEGATIVE_TIMESTAMPS,
				...FFMPEG_COMMAND.CONSTANT_FRAME_RATE,
				segmentPath,
			];

			await runner.run(args, 0, signal);

			return segmentPath;
		}),
	);
}

function validateConcatSegmentsExist(segmentPaths: string[]): void {
	const missing = segmentPaths.filter((p) => !existsSync(p));
	if (missing.length > 0) {
		throw new Error(
			`Concat preflight failed: the following segment file(s) do not exist: ${missing.join(", ")}`,
		);
	}
}

async function preflightConcat(concatFilePath: string, runner: FfmpegRunner): Promise<void> {
	const args = [
		...FFMPEG_COMMAND.CONCAT_SAFE_0,
		FFMPEG_FLAG.INPUT,
		concatFilePath,
		...FFMPEG_COMMAND.COPY,
		FFMPEG_FLAG.DURATION,
		"0.1",
		FFMPEG_FLAG.FORMAT,
		"null",
		"-",
	];
	await runner.run(args);
}

const createConcatFile = async (
	segmentPaths: string[],
	tempDir: string,
	runner: FfmpegRunner,
): Promise<string> => {
	validateConcatSegmentsExist(segmentPaths);
	const concatFile = path.join(tempDir, "concat.txt");
	const content = segmentPaths
		.map((p) => p.replace(/\\/g, "/").replace(/'/g, "'\\''"))
		.map((p) => `file '${p}'`)
		.join("\n");
	await fsp.writeFile(concatFile, content, "utf8");
	if (FFMPEG_PREFLIGHT_CONCAT) {
		try {
			await preflightConcat(concatFile, runner);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			throw new Error(`Concat preflight failed: ${msg}. Set FFMPEG_PREFLIGHT_CONCAT=0 to skip.`);
		}
	}
	return concatFile;
};

const shouldTranscode = (
	hasOverlays: boolean,
	keepSegments: TimeRange[],
	minTranscodeSegmentSeconds: number,
): boolean => {
	return (
		hasOverlays ||
		keepSegments.length > 1 ||
		keepSegments.some((segment) => segment.end - segment.start < minTranscodeSegmentSeconds)
	);
};

const getOutputContentType = (format: "mp4" | "webp" | "dash"): string => {
	if (format === "webp") return "image/webp";
	if (format === "dash") return "application/dash+xml";
	return "video/mp4";
};

const clampFrameTimeMs = (
	frameTimeMs: number | undefined,
	totalDurationSeconds: number,
): number => {
	const totalDurationMs = Math.max(0, Math.round(totalDurationSeconds * 1000));
	const maxFrameTimeMs = Math.max(0, totalDurationMs - 1);

	if (typeof frameTimeMs !== "number" || !Number.isFinite(frameTimeMs)) {
		return 0;
	}

	return Math.min(maxFrameTimeMs, Math.max(0, Math.round(frameTimeMs)));
};

const extractFrameToImage = async (
	inputPath: string,
	outputPath: string,
	frameTimeMs: number,
	runner: FfmpegRunner,
): Promise<void> => {
	const seekTimeSeconds = String(normalizeFfmpegTime(frameTimeMs / 1000));

	const args = [
		FFMPEG_FLAG.SEEK_INPUT,
		seekTimeSeconds,
		FFMPEG_FLAG.INPUT,
		inputPath,
		FFMPEG_COMMAND.HIDE_BANNER,
		FFMPEG_COMMAND.OVERWRITE_OUTPUT,
		...FFMPEG_FLAG.SINGLE_FRAME,
		FFMPEG_FLAG.NO_AUDIO,
		FFMPEG_FLAG.FORMAT,
		"image2",
	];

	await runner.run([...args, outputPath]);
};

const packToDash = async (
	inputMp4: string,
	outputDir: string,
	videoHasAudio: boolean,
	runner: FfmpegRunner,
	segmentDurationS = 4,
): Promise<void> => {
	const manifestPath = path.join(outputDir, "manifest.mpd");
	const adaptationSets = videoHasAudio ? "id=0,streams=v id=1,streams=a" : "id=0,streams=v";

	const args = [
		FFMPEG_COMMAND.HIDE_BANNER,
		FFMPEG_COMMAND.OVERWRITE_OUTPUT,
		FFMPEG_FLAG.INPUT,
		inputMp4,
		FFMPEG_FLAG.STREAM_COPY,
		"copy",
		FFMPEG_FLAG.FORMAT,
		"dash",
		FFMPEG_FLAG.SEGMENT_DURATION,
		String(segmentDurationS),
		FFMPEG_FLAG.USE_TEMPLATE,
		"1",
		FFMPEG_FLAG.USE_TIMELINE,
		"1",
		FFMPEG_FLAG.ADAPTATION_SETS,
		adaptationSets,
		manifestPath,
	];

	await runner.run(args);
};

const uploadDashToS3 = async (
	dashDir: string,
	s3Prefix: string,
	storage: StoragePort,
): Promise<void> => {
	const files = await fsp.readdir(dashDir);
	await Promise.all(
		files.map(async (file) => {
			const filePath = path.join(dashDir, file);
			const s3Key = `${s3Prefix}/${file}`;
			const contentType = file.endsWith(".mpd") ? "application/dash+xml" : "video/mp4";
			await storage.uploadStream(fs.createReadStream(filePath), s3Key, contentType);
		}),
	);
};

export const finalRenderToS3 = async (
	segmentPaths: string[],
	overlayInputs: PreparedOverlayInput[],
	overlays: Overlay[],
	keepSegments: TimeRange[],
	totalDuration: number,
	hasOverlays: boolean,
	sources: VideoSource[],
	tempDir: string,
	format: string,
	audioPaths: { path: string; startTime: number; volume: number }[],
	hasAudio: boolean,
	audioMixMode: "mix" | "replace",
	frameTimeMs: number | undefined,
	s3Key: string,
	storage: StoragePort,
	config: CommonEnvConfig,
	runner: FfmpegRunner,
	expiresInSeconds = 86400,
	onProgress?: (percent: number) => void,
	cropRegion?: { x: number; y: number; width: number; height: number },
	signal?: AbortSignal,
	wmLogoPath?: string,
): Promise<{ s3Key: string; url: string }> => {
	const concatFile = await createConcatFile(segmentPaths, tempDir, runner);

	const videoHasAudio =
		segmentPaths.length > 0 ? await hasAudioStream(segmentPaths[0]).catch(() => false) : false;

	const effectiveHasOverlays = hasOverlays || wmLogoPath !== undefined;
	const needsTranscode = shouldTranscode(
		effectiveHasOverlays,
		keepSegments,
		config.MIN_TRANSCODE_SEGMENT_SECONDS,
	);
	const needsProcessing = needsTranscode || hasAudio || cropRegion !== undefined;

	const builder = new FfmpegCommandBuilder(config);

	builder.addVideoSegments(concatFile).addOverlayInputs(overlayInputs).addAudioSources(audioPaths);
	if (wmLogoPath !== undefined) {
		builder.addWatermarkInput(wmLogoPath);
	}

	const { videoStream, audioStreams } = builder.buildFilters(
		overlays,
		overlayInputs,
		totalDuration,
		hasOverlays,
		audioPaths,
		hasAudio,
		audioMixMode,
		videoHasAudio,
	);

	const args = builder.buildParameters(
		videoStream,
		audioStreams,
		needsProcessing,
		sources,
		format === "webp" || format === "dash" ? "mp4" : format,
		videoHasAudio,
		cropRegion,
	);

	if (format === "webp") {
		const ts = Date.now();
		const renderedVideoPath = path.join(tempDir, `rendered-${ts}.mp4`);
		const renderedFramePath = path.join(tempDir, `rendered-${ts}.png`);
		const renderedWebpPath = path.join(tempDir, `rendered-${ts}.webp`);
		const safeFrameTimeMs = clampFrameTimeMs(frameTimeMs, totalDuration);

		await runner.runToFile(args, renderedVideoPath, totalDuration, onProgress, signal);
		await extractFrameToImage(renderedVideoPath, renderedFramePath, safeFrameTimeMs, runner);
		await sharp(renderedFramePath).webp().toFile(renderedWebpPath);
		await storage.uploadStream(
			fs.createReadStream(renderedWebpPath),
			s3Key,
			getOutputContentType("webp"),
		);
	} else if (format === "dash") {
		const ts = Date.now();
		const renderedVideoPath = path.join(tempDir, `rendered-${ts}.mp4`);
		const dashOutputDir = path.join(tempDir, `dash-${ts}`);
		await fsp.mkdir(dashOutputDir, { recursive: true });

		await runner.runToFile(args, renderedVideoPath, totalDuration, onProgress, signal);

		const renderedHasAudio = await hasAudioStream(renderedVideoPath).catch(() => false);
		await packToDash(renderedVideoPath, dashOutputDir, renderedHasAudio, runner);
		await uploadDashToS3(dashOutputDir, s3Key, storage);

		const manifestKey = `${s3Key}/manifest.mpd`;
		const url = await storage.getPresignedUrl(manifestKey, expiresInSeconds);
		return { s3Key: manifestKey, url };
	} else {
		await runner.runToStream(
			args,
			totalDuration,
			storage,
			s3Key,
			getOutputContentType("mp4"),
			onProgress,
			signal,
		);
	}

	const url = await storage.getPresignedUrl(s3Key, expiresInSeconds);
	return { s3Key, url };
};
