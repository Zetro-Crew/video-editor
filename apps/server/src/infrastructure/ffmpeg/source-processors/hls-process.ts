import { Logger } from "@ztube/observability";
import type { EnvConfig } from "../../../config/env.ts";
import type { VideoSource } from "../../../shared/domain/render-types.ts";
import { FFMPEG_COMMAND, FFMPEG_FLAG } from "../ffmpeg.consts.ts";
import { runFfmpeg } from "../ffmpeg.utils.ts";

export const isHlsUrl = (url: string): boolean => {
	try {
		return new URL(url).pathname.toLowerCase().endsWith(".m3u8");
	} catch {
		return url.toLowerCase().includes(".m3u8");
	}
};

export const processHlsSource = async (
	source: VideoSource,
	sourcePath: string,
	config: EnvConfig,
	signal?: AbortSignal,
): Promise<void> => {
	Logger.logInfo("[ffmpeg] transcoding HLS to MP4", { url: source.url });

	const args = [
		FFMPEG_COMMAND.HIDE_BANNER,
		FFMPEG_COMMAND.OVERWRITE_OUTPUT,
		FFMPEG_FLAG.INPUT,
		source.url,
		FFMPEG_FLAG.VIDEO_CODEC,
		FFMPEG_COMMAND.H264_VIDEO_CODEC,
		FFMPEG_FLAG.ENCODING_PRESET,
		config.FFMPEG_PRESET,
		FFMPEG_FLAG.CRF,
		config.FFMPEG_CRF,
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

	Logger.logInfo("[ffmpeg] HLS transcoded");
};
