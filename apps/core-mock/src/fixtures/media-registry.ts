export type StoredMediaType = "Image" | "ClipVideo" | "UploadedVideo" | "ScreenShotFromLive";

export interface WatchEntry {
	type: StoredMediaType;
	name: string;
}

export interface VideoPlayEntry {
	mediaCreatedAtMs: number;
	durationMs: number;
}

// Hebrew display names mirror the iframe-demo preset buttons.
export const watchRegistry: Record<string, WatchEntry> = {
	"img-001": { type: "Image", name: "תמונת דמו 1" },
	"img-002": { type: "Image", name: "תמונת דמו 2" },
	"img-003": { type: "Image", name: "תמונת דמו 3" },
	"demo-clip-001": { type: "ClipVideo", name: "קליפ דמו" },
	"uploaded-001": { type: "UploadedVideo", name: "סרטון מוקלט" },
	"screenshot-001": { type: "ScreenShotFromLive", name: "צילום מסך משידור" },
};

// Wall-clock anchors per video media id. Aligned with mock-vod's fixture window for parity.
export const videoPlayRegistry: Record<string, VideoPlayEntry> = {
	"demo-clip-001": { mediaCreatedAtMs: 1_700_000_000_000, durationMs: 15_000 },
	"uploaded-001": { mediaCreatedAtMs: 1_700_000_100_000, durationMs: 15_000 },
};

export function isVideoType(type: StoredMediaType): boolean {
	return type === "ClipVideo" || type === "UploadedVideo";
}
