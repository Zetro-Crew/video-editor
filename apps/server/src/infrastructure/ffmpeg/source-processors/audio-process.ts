import { promises as fsp } from "node:fs";
import path from "node:path";
import type { AudioSource } from "@video-editor/contract/internal/edit-video";
import type { CommonEnvConfig } from "../../../config/env.ts";
import type { StoragePort } from "../../../shared/application/ports/outbound/StoragePort.ts";
import { normalizeFfmpegDuration, normalizeFfmpegTime } from "../../../shared/utils/time.utils.ts";
import { FFMPEG_COMMAND, FFMPEG_FLAG } from "../ffmpeg.consts.ts";
import { type FfmpegRunner, hasAudioStream } from "../ffmpeg.utils.ts";
import { isMpdUrl } from "./dash-process.ts";
import { isHlsUrl } from "./hls-process.ts";

const AUDIO_FILE_EXTENSIONS = new Set([
	".aac",
	".flac",
	".m4a",
	".mp3",
	".oga",
	".ogg",
	".opus",
	".wav",
	".weba",
	".webm",
]);

const getActiveAudioSources = (audioSources: AudioSource[]): AudioSource[] => {
	if (!audioSources || audioSources.length === 0) {
		return [];
	}

	const hasSolo = audioSources.some((audio) => audio.solo);

	return audioSources.filter((audio) => {
		if (audio.muted) return false;
		return hasSolo ? audio.solo : true;
	});
};

const calculateAudioProcessing = (
	audio: AudioSource,
	totalDurationSegments: number,
): {
	needsTrim: boolean;
	needsVolume: boolean;
	needsTimelineTrim: boolean;
	audioTrimStart: number;
	extractDuration: number;
} => {
	const audioTrimStart = audio.audioTrimStart ?? 0;
	const audioTrimEnd = audio.audioTrimEnd ?? audio.originalDuration ?? audio.duration;
	const audioTrimDuration = audioTrimEnd - audioTrimStart;

	const audioEndTime = audio.startTime + audio.duration;
	const needsTimelineTrim = audioEndTime > totalDurationSegments;
	const timelineTrimDuration = needsTimelineTrim ? totalDurationSegments - audio.startTime : null;

	const needsTrim = audioTrimStart > 0 || audioTrimEnd < (audio.originalDuration ?? audio.duration);
	const needsVolume = audio.volume !== 1.0;

	const extractDuration =
		needsTimelineTrim && timelineTrimDuration !== null
			? Math.min(timelineTrimDuration, audioTrimDuration)
			: audioTrimDuration;

	return {
		needsTrim,
		needsVolume,
		needsTimelineTrim:
			needsTimelineTrim && timelineTrimDuration !== null && timelineTrimDuration > 0,
		audioTrimStart,
		extractDuration,
	};
};

const isLikelyAudioFileUrl = (url: string): boolean => {
	try {
		const extension = path.extname(new URL(url).pathname).toLowerCase();
		return AUDIO_FILE_EXTENSIONS.has(extension);
	} catch {
		return false;
	}
};

const shouldProbeForEmbeddedAudio = (audio: AudioSource): boolean => {
	if (audio.sourceType === "audio") {
		return false;
	}

	if (audio.sourceType === "video") {
		return true;
	}

	return !isLikelyAudioFileUrl(audio.url);
};

const processAudioFile = async (
	audio: AudioSource,
	audioPath: string,
	index: number,
	tempDir: string,
	totalDurationSegments: number,
	runner: FfmpegRunner,
	signal?: AbortSignal,
): Promise<string> => {
	const processing = calculateAudioProcessing(audio, totalDurationSegments);

	if (processing.needsTrim && processing.extractDuration <= 0) {
		throw new Error(
			`Invalid audio trim range: audioTrimStart (${audio.audioTrimStart ?? 0}) must be less than audioTrimEnd (${audio.audioTrimEnd ?? audio.originalDuration ?? audio.duration})`,
		);
	}

	if (processing.needsTimelineTrim && processing.extractDuration <= 0) {
		throw new Error("Audio starts after video ends");
	}

	const needsProcessing =
		processing.needsTrim || processing.needsVolume || processing.needsTimelineTrim;

	if (!needsProcessing) {
		return audioPath;
	}

	const processedPath = path.join(tempDir, `audio-${index}-processed.m4a`);

	const args: string[] = [];

	// Seek must come before the input for fast stream-level seeking
	if (processing.audioTrimStart > 0) {
		args.push(FFMPEG_FLAG.SEEK_INPUT, String(normalizeFfmpegTime(processing.audioTrimStart)));
	}

	args.push(FFMPEG_FLAG.INPUT, audioPath);

	args.push(FFMPEG_FLAG.DURATION, String(normalizeFfmpegDuration(processing.extractDuration)));

	// Note: do NOT add -map 0:a:0 when audio filters are also applied.
	// The explicit map conflicts with the filter graph output label,
	// causing FFmpeg to error with "Output with label '0:a:0' does not exist".
	if (processing.needsVolume) {
		args.push(FFMPEG_FLAG.AUDIO_FILTER, `volume=${audio.volume.toFixed(3)}`);
	}

	args.push(
		FFMPEG_FLAG.AUDIO_CODEC,
		FFMPEG_COMMAND.AAC_AUDIO_CODEC,
		FFMPEG_FLAG.AUDIO_BITRATE,
		FFMPEG_COMMAND.AUDIO_BITRATE,
		FFMPEG_FLAG.AUDIO_SAMPLE_RATE,
		String(FFMPEG_COMMAND.AUDIO_FREQUENCY),
		FFMPEG_FLAG.AUDIO_CHANNELS,
		"2",
		FFMPEG_COMMAND.HIDE_BANNER,
		FFMPEG_COMMAND.OVERWRITE_OUTPUT,
		processedPath,
	);

	await runner.run(args, 0, signal);

	return processedPath;
};

const materializeStreamingAudioSource = async (
	audio: AudioSource,
	audioPath: string,
	config: CommonEnvConfig,
	runner: FfmpegRunner,
	signal?: AbortSignal,
): Promise<void> => {
	const args = [
		FFMPEG_COMMAND.HIDE_BANNER,
		FFMPEG_COMMAND.OVERWRITE_OUTPUT,
		FFMPEG_FLAG.INPUT,
		audio.url,
		FFMPEG_FLAG.NO_VIDEO,
		FFMPEG_FLAG.AUDIO_CODEC,
		FFMPEG_COMMAND.AAC_AUDIO_CODEC,
		FFMPEG_FLAG.AUDIO_BITRATE,
		FFMPEG_COMMAND.AUDIO_BITRATE,
		FFMPEG_FLAG.AUDIO_SAMPLE_RATE,
		String(FFMPEG_COMMAND.AUDIO_FREQUENCY),
		FFMPEG_FLAG.AUDIO_CHANNELS,
		"2",
		audioPath,
	];

	await runner.run(args, config.TRANSCODE_TIMEOUT_MS, signal);
};

export const prepareAudioSources = async (
	audioSources: AudioSource[],
	tempDir: string,
	totalDurationSegments: number,
	storage: StoragePort,
	config: CommonEnvConfig,
	runner: FfmpegRunner,
	signal?: AbortSignal,
): Promise<{
	audioPaths: { path: string; startTime: number; volume: number }[];
	hasAudio: boolean;
}> => {
	const activeAudio = getActiveAudioSources(audioSources);

	if (activeAudio.length === 0) {
		return { audioPaths: [], hasAudio: false };
	}

	const preparedAudioPaths = await Promise.all(
		activeAudio.map(async (audio, index) => {
			try {
				const isStreamingSource = isMpdUrl(audio.url) || isHlsUrl(audio.url);
				const audioExt = isStreamingSource
					? ".m4a"
					: path.extname(new URL(audio.url).pathname) || ".mp3";
				const audioPath = path.join(tempDir, `audio-${index}${audioExt}`);

				if (isStreamingSource) {
					if (shouldProbeForEmbeddedAudio(audio)) {
						const hasEmbeddedAudio = await hasAudioStream(audio.url);
						if (!hasEmbeddedAudio) {
							console.warn(
								`Audio source at index ${index} has no audio stream, skipping: ${audio.url}`,
							);
							return null;
						}
					}
					await materializeStreamingAudioSource(audio, audioPath, config, runner, signal);
				} else {
					await storage.downloadToFile(audio.url, audioPath);
				}
				await fsp.access(audioPath);
				if (!isStreamingSource && shouldProbeForEmbeddedAudio(audio)) {
					const hasEmbeddedAudio = await hasAudioStream(audioPath);
					if (!hasEmbeddedAudio) {
						console.warn(
							`Audio source at index ${index} has no audio stream, skipping: ${audio.url}`,
						);
						return null;
					}
				}

				const finalAudioPath = await processAudioFile(
					audio,
					audioPath,
					index,
					tempDir,
					totalDurationSegments,
					runner,
					signal,
				);

				return {
					path: finalAudioPath,
					startTime: audio.startTime,
					volume: audio.volume,
				};
			} catch (error) {
				console.error(`Failed to process audio ${audio.url}:`, error);
				throw new Error(`Failed to process audio: ${audio.url}`);
			}
		}),
	);
	const audioPaths = preparedAudioPaths.filter(
		(audioPath): audioPath is { path: string; startTime: number; volume: number } =>
			audioPath !== null,
	);

	return { audioPaths, hasAudio: audioPaths.length > 0 };
};

export const buildAudioFilters = (
	audioPaths: { path: string; startTime: number; volume: number }[],
	audioInputStartIndex: number,
	audioMixMode: "mix" | "replace",
	videoHasAudio: boolean,
): { filterParts: string[]; audioStreams: string[] } => {
	const filterParts: string[] = [];
	const audioStreams: string[] = [];

	if (audioMixMode === "replace") {
		if (audioPaths.length === 1) {
			const [audio] = audioPaths;
			if (!audio) {
				return { filterParts, audioStreams };
			}
			const delay = Math.round(audio.startTime * 1000);
			filterParts.push(`[${audioInputStartIndex}:a]adelay=${delay}|${delay}[a0]`);
			audioStreams.push("[a0]");
		} else {
			for (const [index, audio] of audioPaths.entries()) {
				const delay = Math.round(audio.startTime * 1000);
				filterParts.push(`[${audioInputStartIndex + index}:a]adelay=${delay}|${delay}[a${index}]`);
				audioStreams.push(`[a${index}]`);
			}

			if (audioStreams.length > 1) {
				const mixInputs = audioStreams.join("");
				filterParts.push(
					`${mixInputs}amix=inputs=${audioStreams.length}:duration=shortest[amixed]`,
				);
				return { filterParts, audioStreams: ["[amixed]"] };
			}
		}
	} else {
		for (const [index, audio] of audioPaths.entries()) {
			const delay = Math.round(audio.startTime * 1000);
			filterParts.push(`[${audioInputStartIndex + index}:a]adelay=${delay}|${delay}[a${index}]`);
			audioStreams.push(`[a${index}]`);
		}

		if (videoHasAudio) {
			audioStreams.push("[0:a]");
		}

		if (audioStreams.length > 1) {
			const mixInputs = audioStreams.join("");
			filterParts.push(`${mixInputs}amix=inputs=${audioStreams.length}:duration=shortest[amixed]`);
			return { filterParts, audioStreams: ["[amixed]"] };
		}
	}

	return { filterParts, audioStreams };
};
