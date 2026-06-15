import type { EditorClearProjectMessage, ParentToEditorMessage } from "./schemas.js";

const mockStartTimeMs = 1778412276333;
const mockEndTimeMs = 1778412813617;
const mockDurationMs = mockEndTimeMs - mockStartTimeMs;

export const mockRecordingRangeHlsMessage: ParentToEditorMessage = {
	type: "EDITOR_ADD_PREVIEW_ITEM",
	requestId: "mock-recording-range-hls",
	payload: {
		kind: "recording-range",
		channelId: "20574",
		startTimeMs: mockStartTimeMs,
		endTimeMs: mockEndTimeMs,
		durationMs: mockDurationMs,
		playback: {
			kind: "hls",
			src: "https://example.com/api/editor/hls-preview/jobs/mock-recording/index.m3u8",
		},
		sourceOffsetMs: 6333,
		posterSrc: "https://example.com/mock-recording-poster.jpg",
	},
};

export const mockAudioRangeMessage: ParentToEditorMessage = {
	type: "EDITOR_ADD_PREVIEW_ITEM",
	requestId: "mock-audio-range",
	payload: {
		kind: "audio-range",
		audioId: "audio-501",
		startTimeMs: mockStartTimeMs,
		endTimeMs: mockEndTimeMs,
		durationMs: mockDurationMs,
		playback: {
			kind: "audio",
			src: "https://example.com/audio/mock-track.m4a",
		},
		sourceOffsetMs: 6333,
	},
};

export const mockRecordingRangeNoPlaybackMessage: ParentToEditorMessage = {
	type: "EDITOR_ADD_PREVIEW_ITEM",
	requestId: "mock-recording-range-no-playback",
	payload: {
		kind: "recording-range",
		channelId: "20574",
		startTimeMs: mockStartTimeMs,
		endTimeMs: mockEndTimeMs,
		durationMs: mockDurationMs,
		sourceOffsetMs: 6333,
	},
};

export const mockAddMediaMessage: ParentToEditorMessage = {
	type: "EDITOR_ADD_MEDIA",
	mediaId: "img-001",
};

export const mockClearProjectMessage: EditorClearProjectMessage = {
	type: "EDITOR_CLEAR_PROJECT",
	requestId: "mock-clear-project",
};
