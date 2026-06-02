import type { AudioSource, Overlay, VideoSource } from "@video-editor/contract/internal/edit-video";
import type { TimeRange } from "@video-editor/contract/internal/shared";
import type { VideoRenderPort } from "../../../../shared/application/ports/outbound/VideoRenderPort.ts";
import {
	calculateKeepSegments,
	calculateTotalDurationSegments,
} from "../../domain/video-segment.policy.ts";

export interface VideoRenderInput {
	sources: VideoSource[];
	trimEnd: number;
	cuts: { start: number; end: number }[];
	overlays: Overlay[];
	audioSources: AudioSource[];
	audioMixMode: "mix" | "replace";
	format: "mp4" | "webp" | "dash";
	frameTimeMs?: number;
	cropRegion?: { x: number; y: number; width: number; height: number };
}

export interface VideoRenderOutput {
	s3Key: string;
	url: string;
	segments: TimeRange[];
}

export class VideoRenderUseCase {
	private readonly videoRender: VideoRenderPort;

	constructor(videoRender: VideoRenderPort) {
		this.videoRender = videoRender;
	}

	async execute(
		input: VideoRenderInput,
		s3Key: string,
		onProgress?: (percent: number) => Promise<void>,
		signal?: AbortSignal,
	): Promise<VideoRenderOutput> {
		const keepSegments = calculateKeepSegments(input);
		if (keepSegments.length === 0) {
			throw new Error("No video content would remain after trimming/cuts");
		}

		const totalDuration = calculateTotalDurationSegments(keepSegments);

		const result = await this.videoRender.render({
			sources: input.sources,
			keepSegments,
			totalDuration,
			overlays: input.overlays,
			audioSources: input.audioSources ?? [],
			audioMixMode: input.audioMixMode,
			format: input.format,
			frameTimeMs: input.frameTimeMs,
			cropRegion: input.cropRegion,
			s3Key,
			onProgress,
			signal,
		});

		return { s3Key: result.s3Key, url: result.url, segments: keepSegments };
	}
}
