import type { EnvConfig } from "../../config/env.ts";
import type { Overlay, VideoSource } from "../../shared/domain/render-types.ts";
import { FFMPEG_COMMAND, FFMPEG_FLAG } from "./ffmpeg.consts.ts";
import { buildOverlayFilters, type PreparedOverlayInput } from "./overlays/overlay.service.ts";
import { buildWatermarkFilterParts } from "./overlays/watermark.service.ts";
import { buildAudioFilters } from "./source-processors/audio-process.ts";
import { isMpdUrl } from "./source-processors/dash-process.ts";
import { isHlsUrl } from "./source-processors/hls-process.ts";

export class FfmpegCommandBuilder {
	// Each entry is the full arg block for one input: [input_options..., -i, path]
	private readonly inputBlocks: string[][] = [];
	private filterParts: string[] = [];
	private readonly outputArgs: string[] = [];
	private readonly config: EnvConfig;
	private wmInputIndex: number | null = null;

	constructor(config: EnvConfig) {
		this.config = config;
	}

	public addVideoSegments(concatFile: string): this {
		this.inputBlocks.push([
			...FFMPEG_COMMAND.CONCAT_SAFE_0,
			...FFMPEG_COMMAND.GENERATE_MISSING_PTS,
			FFMPEG_FLAG.INPUT,
			concatFile,
		]);
		return this;
	}

	public addOverlayInputs(overlayInputs: PreparedOverlayInput[]): this {
		for (const overlayInput of overlayInputs) {
			this.inputBlocks.push([FFMPEG_FLAG.INPUT, overlayInput.path]);
		}
		return this;
	}

	public addAudioSources(audioPaths: { path: string; startTime: number; volume: number }[]): this {
		for (const audio of audioPaths) {
			this.inputBlocks.push([FFMPEG_FLAG.INPUT, audio.path]);
		}
		return this;
	}

	public addWatermarkInput(logoPath: string): this {
		this.wmInputIndex = this.inputBlocks.length;
		this.inputBlocks.push([FFMPEG_FLAG.INPUT, logoPath]);
		return this;
	}

	public buildFilters(
		overlays: Overlay[],
		overlayInputs: PreparedOverlayInput[],
		totalDuration: number,
		hasOverlays: boolean,
		audioPaths: { path: string; startTime: number; volume: number }[],
		hasAudio: boolean,
		audioMixMode: "mix" | "replace",
		videoHasAudio: boolean,
	): {
		videoStream: string;
		audioStreams: string[];
		needsVideoFilter: boolean;
	} {
		const overlayResult =
			hasOverlays && overlays && overlays.length > 0
				? (() => {
						const { filterComplex, outputStream } = buildOverlayFilters(
							overlays,
							overlayInputs,
							totalDuration,
						);
						if (filterComplex) {
							this.filterParts.push(filterComplex);
							return {
								videoStream: `[${outputStream}]`,
								needsVideoFilter: true,
							};
						}
						return { videoStream: "[0:v]", needsVideoFilter: false };
					})()
				: { videoStream: "[0:v]", needsVideoFilter: false };

		let effectiveVideoStream = overlayResult.videoStream;
		let needsVideoFilter = overlayResult.needsVideoFilter;

		if (this.wmInputIndex !== null) {
			const wmParts = buildWatermarkFilterParts(effectiveVideoStream, this.wmInputIndex, "wmout");
			this.filterParts.push(...wmParts);
			effectiveVideoStream = "[wmout]";
			needsVideoFilter = true;
		}

		const audioResult =
			hasAudio && audioPaths.length > 0
				? (() => {
						const audioInputStartIndex = overlayInputs.length + 1;

						const audioFilterResult = buildAudioFilters(
							audioPaths,
							audioInputStartIndex,
							audioMixMode,
							videoHasAudio,
						);
						this.filterParts.push(...audioFilterResult.filterParts);
						return audioFilterResult.audioStreams;
					})()
				: videoHasAudio && needsVideoFilter
					? (() => {
							this.filterParts.push("[0:a]anull[audioout]");
							return ["[audioout]"];
						})()
					: [];

		const finalVideoStream =
			this.filterParts.length > 0 && !needsVideoFilter && audioResult.length === 0
				? (() => {
						this.filterParts.unshift("[0:v]null[vout]");
						return "[vout]";
					})()
				: effectiveVideoStream;

		return {
			videoStream: finalVideoStream,
			audioStreams: audioResult,
			needsVideoFilter,
		};
	}

	public buildParameters(
		videoStream: string,
		audioStreams: string[],
		needsProcessing: boolean,
		sources: VideoSource[],
		format: string,
		videoHasAudio: boolean,
		cropRegion?: { x: number; y: number; width: number; height: number },
	): string[] {
		let finalVideoStream = videoStream;

		if (cropRegion && cropRegion.width > 0 && cropRegion.height > 0) {
			const cropFilter = `crop=${cropRegion.width}:${cropRegion.height}:${cropRegion.x}:${cropRegion.y}`;
			if (this.filterParts.length > 0) {
				this.filterParts.push(`${finalVideoStream}${cropFilter}[cropout]`);
				finalVideoStream = "[cropout]";
			} else {
				this.filterParts.push(`[0:v]${cropFilter}[cropout]`);
				finalVideoStream = "[cropout]";
			}
		}

		if (this.filterParts.length > 0) {
			this.outputArgs.push(FFMPEG_FLAG.COMPLEX_FILTER, this.filterParts.join(";"));
			this.outputArgs.push(FFMPEG_FLAG.MAP, finalVideoStream);
			if (audioStreams.length > 0 && audioStreams[0]) {
				this.outputArgs.push(FFMPEG_FLAG.MAP, audioStreams[0]);
			}
		} else {
			this.outputArgs.push(FFMPEG_FLAG.MAP, "0:v");
			if (videoHasAudio) {
				this.outputArgs.push(FFMPEG_FLAG.MAP, "0:a");
			}
		}

		if (needsProcessing) {
			const { preset, crf } = this.getEncodingSettings(sources);
			this.outputArgs.push(
				FFMPEG_FLAG.VIDEO_CODEC,
				FFMPEG_COMMAND.H264_VIDEO_CODEC,
				FFMPEG_FLAG.ENCODING_PRESET,
				preset,
				FFMPEG_FLAG.CRF,
				crf,
				FFMPEG_FLAG.PIXEL_FORMAT,
				"yuv420p",
				"-colorspace",
				"bt709",
				"-color_primaries",
				"bt709",
				"-color_trc",
				"bt709",
				FFMPEG_FLAG.AUDIO_CODEC,
				FFMPEG_COMMAND.AAC_AUDIO_CODEC,
				FFMPEG_FLAG.SHORTEST,
				FFMPEG_FLAG.AUDIO_BITRATE,
				this.config.FFMPEG_AUDIO_BITRATE,
			);

			if (format === "mp4") {
				this.outputArgs.push(...FFMPEG_COMMAND.MOVFLAGS_FRAG_FASTSTART);
			}
		} else {
			this.outputArgs.push(...FFMPEG_COMMAND.COPY);
			if (format === "mp4") {
				this.outputArgs.push(...FFMPEG_COMMAND.MOVFLAGS_FRAG_FASTSTART);
			}
		}

		this.outputArgs.push(FFMPEG_FLAG.FORMAT, format, FFMPEG_COMMAND.HIDE_BANNER);

		return [...this.inputBlocks.flat(), ...this.outputArgs];
	}

	private getEncodingSettings(sources: VideoSource[]): {
		preset: string;
		crf: string;
	} {
		const hasMpdSource = sources.some((s) => isMpdUrl(s.url) || isHlsUrl(s.url));
		return {
			preset: hasMpdSource ? "medium" : this.config.FFMPEG_PRESET,
			crf: hasMpdSource ? "18" : this.config.FFMPEG_CRF,
		};
	}
}
