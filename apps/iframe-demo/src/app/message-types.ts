export const EDITOR_ADD_PREVIEW_ITEM = "EDITOR_ADD_PREVIEW_ITEM";
export const EDITOR_ADD_MEDIA = "EDITOR_ADD_MEDIA";
export const EDITOR_CLEAR_PROJECT = "EDITOR_CLEAR_PROJECT";
export const EDITOR_READY = "EDITOR_READY";

export type RecordingRangePayload = {
	kind: "recording-range";
	channelId: string;
	startTimeMs: number;
	endTimeMs: number;
	durationMs: number;
	name?: string;
};

export type AudioRangePayload = {
	kind: "audio-range";
	audioId: string;
	startTimeMs?: number;
	endTimeMs?: number;
	durationMs: number;
	playback: { kind: "audio" | "hls"; src: string };
	sourceOffsetMs?: number;
	name?: string;
};

export type PreviewItemPayload = RecordingRangePayload | AudioRangePayload;

export interface EditorResponse {
	type?: string;
	requestId?: string;
	mediaId?: string;
	reason?: string;
	itemId?: string;
}
