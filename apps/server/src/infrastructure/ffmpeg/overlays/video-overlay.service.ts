import { promises as fsp } from "node:fs";
import path from "node:path";
import type { EnvConfig } from "../../../config/env.ts";
import type { StoragePort } from "../../../shared/application/ports/outbound/StoragePort.ts";
import type { VideoOverlay } from "../../../shared/domain/render-types.ts";
import { normalizeFfmpegDuration, normalizeFfmpegTime } from "../../../shared/utils/time.utils.ts";
import { FFMPEG_COMMAND, FFMPEG_FLAG } from "../ffmpeg.consts.ts";
import { runFfmpeg } from "../ffmpeg.utils.ts";
import { isMpdUrl, processMpdSource } from "../source-processors/dash-process.ts";
import { isHlsUrl, processHlsSource } from "../source-processors/hls-process.ts";
import { buildEnableExpression } from "./overlay-utils.ts";

const formatNumber = (value: number): string => {
	return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
};

const getBaseDimensions = (overlay: VideoOverlay): { width: number; height: number } => {
	const cropWidth = overlay.crop?.width;
	const cropHeight = overlay.crop?.height;

	return {
		width: Math.max(1, cropWidth ?? overlay.width ?? 1),
		height: Math.max(1, cropHeight ?? overlay.height ?? 1),
	};
};

const parseScale = (transform?: string): { scaleX: number; scaleY: number } => {
	if (!transform || transform === "none") return { scaleX: 1, scaleY: 1 };

	const scaleMatch = /scale\(([^)]+)\)/.exec(transform);
	if (!scaleMatch) return { scaleX: 1, scaleY: 1 };

	const values =
		scaleMatch[1]
			?.split(",")
			.map((value) => Number.parseFloat(value.trim()))
			.filter((value) => Number.isFinite(value)) ?? [];

	if (values.length === 0) return { scaleX: 1, scaleY: 1 };
	if (values.length === 1) return { scaleX: values[0] ?? 1, scaleY: values[0] ?? 1 };

	return {
		scaleX: values[0] ?? 1,
		scaleY: values[1] ?? 1,
	};
};

const buildRoundedCornerAlpha = (overlay: VideoOverlay): string | null => {
	const borderRadiusPercent = overlay.borderRadius ?? 0;
	if (borderRadiusPercent <= 0) return null;

	const { width, height } = getBaseDimensions(overlay);
	const radius = Math.max(
		0,
		Math.min(Math.min(width, height) / 2, (Math.min(width, height) * borderRadiusPercent) / 100),
	);
	if (radius <= 0) return null;

	const r = formatNumber(radius);
	const alphaExpr = [
		`if(gte(X\\,${r})*gte(Y\\,${r})*lte(X\\,W-${r})*lte(Y\\,H-${r})`,
		"255",
		`if(lte(hypot(${r}-X\\,${r}-Y)\\,${r})+lte(hypot(X-(W-${r})\\,${r}-Y)\\,${r})+lte(hypot(${r}-X\\,Y-(H-${r}))\\,${r})+lte(hypot(X-(W-${r})\\,Y-(H-${r}))\\,${r})`,
		"255",
		"0))",
	].join("\\,");

	return `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alphaExpr}'`;
};

const buildVideoProcessingChain = (overlay: VideoOverlay): string[] => {
	const displayDuration = Math.max(0.01, overlay.end - overlay.start);
	const stages: string[] = [`trim=duration=${formatNumber(displayDuration)}`];

	if (overlay.width !== undefined || overlay.height !== undefined) {
		stages.push(
			`scale=w=${overlay.width !== undefined ? Math.max(1, overlay.width) : -1}:h=${overlay.height !== undefined ? Math.max(1, overlay.height) : -1}`,
		);
	}

	if (overlay.crop) {
		stages.push(
			`crop=w=${Math.max(1, overlay.crop.width)}:h=${Math.max(1, overlay.crop.height)}:x=${Math.max(0, overlay.crop.x)}:y=${Math.max(0, overlay.crop.y)}`,
		);
	}

	const roundedMask = buildRoundedCornerAlpha(overlay);
	if (roundedMask) {
		stages.push(roundedMask);
	}

	if (overlay.brightness !== undefined && overlay.brightness !== 100) {
		stages.push(`eq=brightness=${formatNumber((overlay.brightness - 100) / 100)}`);
	}

	if (overlay.blur !== undefined && overlay.blur > 0) {
		stages.push(`boxblur=luma_radius=${formatNumber(Math.min(overlay.blur, 20))}:luma_power=1`);
	}

	if (overlay.opacity !== undefined && overlay.opacity < 1) {
		stages.push(`colorchannelmixer=aa=${formatNumber(Math.max(0, overlay.opacity))}`);
	}

	const { scaleX, scaleY } = parseScale(overlay.transform);
	if (scaleX !== 1 || scaleY !== 1) {
		const { width, height } = getBaseDimensions(overlay);
		stages.push(
			`scale=w=${formatNumber(Math.max(1, width * Math.abs(scaleX)))}:h=${formatNumber(Math.max(1, height * Math.abs(scaleY)))}`,
		);
	}

	if (overlay.rotation !== undefined && overlay.rotation !== 0) {
		const radians = (overlay.rotation * Math.PI) / 180;
		stages.push(`rotate=${formatNumber(radians)}:ow=rotw(iw):oh=roth(ih):c=none`);
	}

	stages.push(`setpts=PTS-STARTPTS+${formatNumber(Math.max(0, overlay.start))}/TB`);
	stages.push("format=rgba");
	return stages;
};

export const prepareVideoOverlay = async (
	overlay: VideoOverlay,
	tempDir: string,
	storage: StoragePort,
	config: EnvConfig,
	signal?: AbortSignal,
): Promise<string> => {
	const downloadedPath = path.join(tempDir, `video-overlay-src-${overlay.id}.mp4`);
	const preparedPath = path.join(tempDir, `video-overlay-${overlay.id}.mp4`);

	if (isMpdUrl(overlay.sourceUrl)) {
		await processMpdSource(
			{
				url: overlay.sourceUrl,
				type: "video",
				duration: Math.max(0.1, overlay.end - overlay.start),
				...(overlay.trimFrom !== undefined && { trimFrom: overlay.trimFrom }),
				...(overlay.trimTo !== undefined && { trimTo: overlay.trimTo }),
			},
			downloadedPath,
			false,
			config,
			signal,
		);
	} else if (isHlsUrl(overlay.sourceUrl)) {
		await processHlsSource(
			{
				url: overlay.sourceUrl,
				type: "video",
				duration: Math.max(0.1, overlay.end - overlay.start),
				...(overlay.trimFrom !== undefined && { trimFrom: overlay.trimFrom }),
				...(overlay.trimTo !== undefined && { trimTo: overlay.trimTo }),
			},
			downloadedPath,
			config,
			signal,
		);
	} else {
		await storage.downloadToFile(overlay.sourceUrl, downloadedPath);
	}

	if (overlay.trimFrom === undefined && overlay.trimTo === undefined) {
		await fsp.rename(downloadedPath, preparedPath);
		return preparedPath;
	}

	const rawTrimFrom = overlay.trimFrom ?? 0;
	const trimFrom = String(normalizeFfmpegTime(rawTrimFrom));
	const trimTo = overlay.trimTo;

	if (trimTo !== undefined && trimTo <= rawTrimFrom) {
		throw new Error(
			`Invalid overlay trim: trimFrom (${rawTrimFrom}) must be less than trimTo (${trimTo})`,
		);
	}

	const args: string[] = [
		FFMPEG_COMMAND.HIDE_BANNER,
		// Seek before input for fast keyframe-level seeking
		FFMPEG_FLAG.SEEK_INPUT,
		trimFrom,
		FFMPEG_FLAG.INPUT,
		downloadedPath,
	];

	if (trimTo !== undefined) {
		args.push(FFMPEG_FLAG.DURATION, String(normalizeFfmpegDuration(trimTo - rawTrimFrom)));
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
		FFMPEG_FLAG.NO_AUDIO,
		FFMPEG_COMMAND.OVERWRITE_OUTPUT,
		...FFMPEG_COMMAND.AVOID_NEGATIVE_TIMESTAMPS,
		...FFMPEG_COMMAND.CONSTANT_FRAME_RATE,
		preparedPath,
	);

	await runFfmpeg(args, 0, signal);

	await fsp.unlink(downloadedPath).catch(() => undefined);
	return preparedPath;
};

export const buildVideoOverlayFilter = (
	overlay: VideoOverlay,
	inputIndex: number,
	currentStream: string,
	outputLabel: string,
): string => {
	const processedLabel = `videoOverlay${inputIndex}`;
	const enable = buildEnableExpression(overlay.start, overlay.end);
	const { width, height } = getBaseDimensions(overlay);
	const x = `${formatNumber(overlay.left + width / 2)}-overlay_w/2`;
	const y = `${formatNumber(overlay.top + height / 2)}-overlay_h/2`;
	const processingChain = buildVideoProcessingChain(overlay).join(",");

	return `[${inputIndex}:v]${processingChain}[${processedLabel}];${currentStream}[${processedLabel}]overlay=x='${x}':y='${y}':enable='${enable}':eof_action=pass[${outputLabel}]`;
};
