import { promises as fsp } from "node:fs";
import type { VideoSource } from "@video-editor/contract/internal/edit-video";
import { Logger } from "@ztube/observability";
import type { EnvConfig } from "../../../config/env.ts";
import { validateMpdRestrictions } from "../../../features/edit-video/domain/video-segment.policy.ts";
import { FFMPEG_COMMAND, FFMPEG_FLAG } from "../ffmpeg.consts.ts";
import { runFfmpeg } from "../ffmpeg.utils.ts";

export const isMpdUrl = (url: string): boolean => url.toLowerCase().endsWith(".mpd");

export const processMpdSource = async (
	source: VideoSource,
	sourcePath: string,
	hasMpdSource: boolean,
	config: EnvConfig,
	signal?: AbortSignal,
): Promise<void> => {
	Logger.logInfo("[ffmpeg] processing MPD stream", { url: source.url });

	await validateMpdRestrictions(source.url);
	const mpdCrf = hasMpdSource ? config.MPD_TRANSCODE_CRF_MULTI : config.MPD_TRANSCODE_CRF_SINGLE;
	Logger.logInfo("[ffmpeg] transcoding MPD to MP4", { crf: mpdCrf });

	const args = [
		FFMPEG_COMMAND.HIDE_BANNER,
		FFMPEG_COMMAND.OVERWRITE_OUTPUT,
		FFMPEG_FLAG.INPUT,
		source.url,
		FFMPEG_FLAG.VIDEO_CODEC,
		FFMPEG_COMMAND.H264_VIDEO_CODEC,
		FFMPEG_FLAG.ENCODING_PRESET,
		config.MPD_TRANSCODE_PRESET,
		FFMPEG_FLAG.CRF,
		mpdCrf,
		FFMPEG_FLAG.FRAME_RATE,
		"25",
		FFMPEG_FLAG.VIDEO_FILTER,
		[FFMPEG_COMMAND.EVEN_DIMENSIONS, FFMPEG_COMMAND.FORMAT_YUV420P].join(","),
		...FFMPEG_COMMAND.CONSTANT_FRAME_RATE,
		...FFMPEG_COMMAND.MOVE_METADATA_TO_BEGINNING,
		FFMPEG_FLAG.AUDIO_CODEC,
		FFMPEG_COMMAND.AAC_AUDIO_CODEC,
		FFMPEG_FLAG.AUDIO_BITRATE,
		FFMPEG_COMMAND.AUDIO_BITRATE,
		FFMPEG_FLAG.AUDIO_SAMPLE_RATE,
		String(FFMPEG_COMMAND.AUDIO_FREQUENCY),
		FFMPEG_FLAG.AUDIO_CHANNELS,
		"2",
		FFMPEG_FLAG.SHORTEST,
		sourcePath,
	];

	await runFfmpeg(args, config.ENABLE_MPD_RESTRICTIONS ? config.TRANSCODE_TIMEOUT_MS : 0, signal);

	if (config.ENABLE_MPD_RESTRICTIONS) {
		const stats = await fsp.stat(sourcePath);
		const sizeMB = stats.size / (1024 * 1024);
		if (sizeMB > config.MAX_TEMP_FILE_SIZE_MB) {
			await fsp.unlink(sourcePath);
			throw new Error(
				`Transcoded MPD file size (${Math.round(sizeMB)}MB) exceeds maximum allowed (${config.MAX_TEMP_FILE_SIZE_MB}MB)`,
			);
		}
		Logger.logInfo("[ffmpeg] MPD transcoded", { sizeMB: Math.round(sizeMB) });
	} else {
		Logger.logInfo("[ffmpeg] MPD transcoded");
	}
};
