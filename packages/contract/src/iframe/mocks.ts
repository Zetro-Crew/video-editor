import type {
	EditorClearProjectMessage,
	EditorMediaSavedMessage,
	ParentToEditorMessage,
} from "./messages.js";

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

export const mockMediaMp4Message: ParentToEditorMessage = {
	type: "EDITOR_ADD_PREVIEW_ITEM",
	requestId: "mock-media-mp4",
	payload: {
		kind: "media",
		mediaId: "media-1001",
		durationMs: 120000,
		playback: {
			kind: "mp4",
			src: "https://example.com/media/mock-video.mp4",
		},
		posterSrc: "https://example.com/media/mock-video-poster.jpg",
	},
};

export const mockMediaHlsMessage: ParentToEditorMessage = {
	type: "EDITOR_ADD_PREVIEW_ITEM",
	requestId: "mock-media-hls",
	payload: {
		kind: "media",
		mediaId: "media-1002",
		durationMs: 180000,
		playback: {
			kind: "hls",
			src: "https://example.com/media/mock-video/index.m3u8",
		},
		posterSrc: "https://example.com/media/mock-video-hls-poster.jpg",
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

export const mockClearProjectMessage: EditorClearProjectMessage = {
	type: "EDITOR_CLEAR_PROJECT",
	requestId: "mock-clear-project",
};

export const mockMediaSavedMessage: EditorMediaSavedMessage = {
	type: "EDITOR_MEDIA_SAVED",
	mediaId: "550e8400-e29b-41d4-a716-446655440000",
	mediaName: "My Edited Clip",
	downloadToComputer: true,
	saveToPersonalChannel: false,
	selectedUnitChannelIds: [],
	url: "https://example.com/output/mock-video.mp4",
	exportType: "mp4",
	items: [
		{ type: "recording", id: "20574", from: 0, to: 537284 },
		{ type: "audio", id: "audio-501", from: 0, to: 537284 },
		{ type: "image", id: "img-item-1" },
		{ type: "clip", id: "media-1001" },
	],
};
