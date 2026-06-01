import { existsSync, promises as fsp } from "node:fs";
import path from "node:path";
import type { VideoSource } from "@video-editor/contract/internal/edit-video";
import type { EnvConfig } from "../../../config/env.ts";
import type { StoragePort } from "../../../shared/application/ports/outbound/StoragePort.ts";
import { normalizeFfmpegDuration, normalizeFfmpegTime } from "../../../shared/utils/time.utils.ts";
import { FFMPEG_COMMAND, FFMPEG_FLAG } from "../ffmpeg.consts.ts";
import { runFfmpeg } from "../ffmpeg.utils.ts";
import { isMpdUrl, processMpdSource } from "./dash-process.ts";
import { isHlsUrl, processHlsSource } from "./hls-process.ts";
import { processImageSource } from "./image-process.ts";

export const processSources = async (
	sources: VideoSource[],
	tempDir: string,
	storage: StoragePort,
	config: EnvConfig,
	signal?: AbortSignal,
): Promise<string> => {
	if (sources.length === 1) {
		const sourcePath = path.join(tempDir, "source-0.mp4");

		return await processSingleSource(
			sources[0] as VideoSource,
			sourcePath,
			tempDir,
			storage,
			config,
			signal,
		);
	}
	const hasMpdSource = sources.some((source) => isMpdUrl(source.url) || isHlsUrl(source.url));
	const sourcePaths = await processMultipleSources(sources, tempDir, storage, config, signal);
	const concatenatedPath = await concatenateSources(
		sourcePaths,
		tempDir,
		hasMpdSource,
		config,
		signal,
	);

	return concatenatedPath;
};

const generateBlankVideoSegment = async (
	source: VideoSource,
	outputPath: string,
): Promise<void> => {
	const url = new URL(source.url);
	const width = Number.parseInt(url.searchParams.get("w") ?? "1920", 10);
	const height = Number.parseInt(url.searchParams.get("h") ?? "1080", 10);
	const fps = Number.parseInt(url.searchParams.get("fps") ?? "30", 10);

	const args = [
		FFMPEG_COMMAND.HIDE_BANNER,
		// Black video source via lavfi — dimensions and frame rate from URL params
		...FFMPEG_COMMAND.TREAT_AS_LIBAV_FILTER,
		FFMPEG_FLAG.INPUT,
		`color=c=black:s=${width}x${height}:r=${fps}`,
		// Silent stereo audio source via lavfi
		...FFMPEG_COMMAND.TREAT_AS_LIBAV_FILTER,
		FFMPEG_FLAG.INPUT,
		"anullsrc=channel_layout=stereo:sample_rate=44100",
		FFMPEG_FLAG.DURATION,
		String(source.duration),
		FFMPEG_FLAG.VIDEO_CODEC,
		FFMPEG_COMMAND.H264_VIDEO_CODEC,
		FFMPEG_FLAG.PIXEL_FORMAT,
		"yuv420p",
		FFMPEG_FLAG.AUDIO_CODEC,
		FFMPEG_COMMAND.AAC_AUDIO_CODEC,
		FFMPEG_FLAG.AUDIO_BITRATE,
		FFMPEG_COMMAND.AUDIO_BITRATE,
		FFMPEG_FLAG.AUDIO_SAMPLE_RATE,
		String(FFMPEG_COMMAND.AUDIO_FREQUENCY),
		FFMPEG_FLAG.AUDIO_CHANNELS,
		"2",
		FFMPEG_COMMAND.OVERWRITE_OUTPUT,
		outputPath,
	];

	await runFfmpeg(args);
};

const processSingleSource = async (
	source: VideoSource,
	sourcePath: string,
	tempDir: string,
	storage: StoragePort,
	config: EnvConfig,
	signal?: AbortSignal,
): Promise<string> => {
	if (source.url.startsWith("internal://blank")) {
		await generateBlankVideoSegment(source, sourcePath);

		return sourcePath;
	}
	if (source.type === "image") {
		await processImageSource(source, sourcePath, tempDir, storage);

		return sourcePath;
	}
	if (isMpdUrl(source.url)) {
		await processMpdSource(source, sourcePath, false, config, signal);

		return sourcePath;
	}
	if (isHlsUrl(source.url)) {
		await processHlsSource(source, sourcePath, config, signal);

		return sourcePath;
	}
	await storage.downloadToFile(source.url, sourcePath);

	if (source.trimFrom !== undefined || source.trimTo !== undefined) {
		const trimmedPath = path.join(tempDir, `trimmed-${Date.now()}.mp4`);
		const rawTrimFrom = source.trimFrom ?? 0;
		const seekInput = String(normalizeFfmpegTime(rawTrimFrom));

		const args: string[] = [
			FFMPEG_COMMAND.HIDE_BANNER,
			// Seek before input for fast keyframe-level seeking
			FFMPEG_FLAG.SEEK_INPUT,
			seekInput,
			FFMPEG_FLAG.INPUT,
			sourcePath,
		];

		if (source.trimTo !== undefined) {
			args.push(FFMPEG_FLAG.DURATION, String(normalizeFfmpegDuration(source.trimTo - rawTrimFrom)));
		}

		args.push(
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
			FFMPEG_FLAG.AUDIO_BITRATE,
			FFMPEG_COMMAND.AUDIO_BITRATE,
			FFMPEG_FLAG.AUDIO_SAMPLE_RATE,
			String(FFMPEG_COMMAND.AUDIO_FREQUENCY),
			FFMPEG_FLAG.AUDIO_CHANNELS,
			"2",
			FFMPEG_COMMAND.OVERWRITE_OUTPUT,
			...FFMPEG_COMMAND.AVOID_NEGATIVE_TIMESTAMPS,
			trimmedPath,
		);

		await runFfmpeg(args, 0, signal);
		await fsp.rename(trimmedPath, sourcePath);
	}

	return sourcePath;
};

const processMultipleSources = async (
	sources: VideoSource[],
	tempDir: string,
	storage: StoragePort,
	config: EnvConfig,
	signal?: AbortSignal,
): Promise<string[]> => {
	const sourcePaths = await Promise.all(
		sources.map(async (source, index) => {
			const sourcePath = path.join(tempDir, `source-${index}.mp4`);
			return await processSingleSource(source, sourcePath, tempDir, storage, config, signal);
		}),
	);

	return sourcePaths;
};

const concatenateSources = async (
	sourcePaths: string[],
	tempDir: string,
	hasMpdSource: boolean,
	config: EnvConfig,
	signal?: AbortSignal,
): Promise<string> => {
	const missing = sourcePaths.filter((p) => !existsSync(p));
	if (missing.length > 0) {
		throw new Error(
			`Concat failed: the following source file(s) do not exist: ${missing.join(", ")}`,
		);
	}

	const concatListPath = path.join(tempDir, "concat-list.txt");
	const concatenatedPath = path.join(tempDir, "concatenated.mp4");

	const concatLines = sourcePaths
		.map((p) => {
			const normalizedPath = p.replace(/\\/g, "/");
			const escapedPath = normalizedPath.replace(/'/g, "'\\''");
			return `file '${escapedPath}'`;
		})
		.join("\n");
	await fsp.writeFile(concatListPath, concatLines, "utf-8");

	const concatPreset = hasMpdSource ? "medium" : config.FFMPEG_PRESET;
	const concatCrf = hasMpdSource ? "18" : config.FFMPEG_CRF;

	const args = [
		FFMPEG_COMMAND.HIDE_BANNER,
		...FFMPEG_COMMAND.CONCAT_SAFE_0,
		...FFMPEG_COMMAND.GENERATE_MISSING_PTS,
		FFMPEG_FLAG.INPUT,
		concatListPath,
		FFMPEG_FLAG.VIDEO_CODEC,
		FFMPEG_COMMAND.H264_VIDEO_CODEC,
		FFMPEG_FLAG.ENCODING_PRESET,
		concatPreset,
		FFMPEG_FLAG.CRF,
		concatCrf,
		FFMPEG_FLAG.PIXEL_FORMAT,
		"yuv420p",
		FFMPEG_FLAG.VIDEO_FILTER,
		FFMPEG_COMMAND.FORMAT_YUV420P,
		FFMPEG_COMMAND.OVERWRITE_OUTPUT,
		...FFMPEG_COMMAND.AVOID_NEGATIVE_TIMESTAMPS,
		FFMPEG_FLAG.AUDIO_CODEC,
		FFMPEG_COMMAND.AAC_AUDIO_CODEC,
		FFMPEG_FLAG.AUDIO_BITRATE,
		FFMPEG_COMMAND.AUDIO_BITRATE,
		FFMPEG_FLAG.AUDIO_SAMPLE_RATE,
		String(FFMPEG_COMMAND.AUDIO_FREQUENCY),
		FFMPEG_FLAG.AUDIO_CHANNELS,
		"2",
		concatenatedPath,
	];

	await runFfmpeg(args, 0, signal);

	return concatenatedPath;
};
