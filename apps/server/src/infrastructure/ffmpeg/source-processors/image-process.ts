import path from "node:path";
import sharp from "sharp";
import type { StoragePort } from "../../../shared/application/ports/outbound/StoragePort.ts";
import type { VideoSource } from "../../../shared/domain/render-types.ts";
import { FFMPEG_COMMAND, FFMPEG_FLAG } from "../ffmpeg.consts.ts";
import { runFfmpeg } from "../ffmpeg.utils.ts";

export const getImageExtension = (url: string): string => {
	const clean = url.split("?")[0] || url;
	const ext = path.extname(clean).toLowerCase().replace(".", "");
	return ext.length > 0 ? ext : "png";
};

export const convertWebpToPng = async (webpPath: string): Promise<string> => {
	const pngPath = webpPath.replace(/\.webp$/i, ".png");
	await sharp(webpPath).png().toFile(pngPath);
	return pngPath;
};

const createImagePath = (tempDir: string, ext: string): string => {
	return path.join(tempDir, `image-${Date.now()}.${ext}`);
};

export const processImageSource = async (
	source: VideoSource,
	sourcePath: string,
	tempDir: string,
	storage: StoragePort,
): Promise<void> => {
	const originalExt = getImageExtension(source.url);
	const downloadedImagePath = createImagePath(tempDir, originalExt);
	await storage.downloadToFile(source.url, downloadedImagePath);
	const finalImagePath =
		originalExt === "webp" ? await convertWebpToPng(downloadedImagePath) : downloadedImagePath;

	const args = [
		FFMPEG_COMMAND.HIDE_BANNER,
		FFMPEG_COMMAND.OVERWRITE_OUTPUT,
		// Loop input image indefinitely so -t controls output duration
		...FFMPEG_COMMAND.LOOP_INDEFINITE,
		FFMPEG_FLAG.INPUT,
		finalImagePath,
		// Supply silent audio from lavfi so the output has an audio track
		...FFMPEG_COMMAND.TREAT_AS_LIBAV_FILTER,
		FFMPEG_FLAG.INPUT,
		...FFMPEG_COMMAND.NULL_AUDIO_STREAM,
		FFMPEG_FLAG.VIDEO_CODEC,
		FFMPEG_COMMAND.H264_VIDEO_CODEC,
		FFMPEG_FLAG.DURATION,
		String(source.duration),
		FFMPEG_FLAG.VIDEO_FILTER,
		[FFMPEG_COMMAND.EVEN_DIMENSIONS, FFMPEG_COMMAND.FORMAT_YUV420P].join(","),
		FFMPEG_FLAG.FRAME_RATE,
		"25",
		...FFMPEG_COMMAND.CONSTANT_FRAME_RATE,
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

	await runFfmpeg(args);
};
