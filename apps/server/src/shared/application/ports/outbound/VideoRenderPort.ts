import type { AudioSource, Overlay, VideoSource } from "@video-editor/contract/internal/edit-video";
import type { TimeRange } from "@video-editor/contract/internal/shared";

export interface RenderJob {
	sources: VideoSource[];
	keepSegments: TimeRange[];
	totalDuration: number;
	overlays: Overlay[];
	audioSources: AudioSource[];
	audioMixMode: "mix" | "replace";
	format: "mp4" | "webp" | "dash";
	frameTimeMs?: number;
	cropRegion?: { x: number; y: number; width: number; height: number };
	s3Key: string;
	onProgress?: (percent: number) => Promise<void>;
	signal?: AbortSignal;
}

export interface RenderResult {
	s3Key: string;
	url: string;
}

export interface VideoRenderPort {
	render(job: RenderJob): Promise<RenderResult>;
}
