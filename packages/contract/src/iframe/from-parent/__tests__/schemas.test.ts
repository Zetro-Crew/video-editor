import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	mockAudioRangeMessage,
	mockClearProjectMessage,
	mockMediaHlsMessage,
	mockMediaMp4Message,
	mockRecordingRangeHlsMessage,
	mockRecordingRangeNoPlaybackMessage,
} from "../mocks.js";
import { parentToEditorMessageSchema } from "../schemas.js";

const baseRecordingPayload = {
	kind: "recording-range" as const,
	channelId: "20574",
	startTimeMs: 1000,
	endTimeMs: 2000,
	durationMs: 1000,
	playback: { kind: "hls" as const, src: "https://example.com/index.m3u8" },
};

const baseAudioPayload = {
	kind: "audio-range" as const,
	audioId: "a1",
	startTimeMs: 1000,
	endTimeMs: 2000,
	durationMs: 1000,
	playback: { kind: "audio" as const, src: "https://example.com/track.m4a" },
};

const MAX_MS = 1000 * 60 * 60; // 1 hour

describe("from-parent — business rules", () => {
	it("rejects unsafe (non-http/https) src in hls playback", () => {
		const result = parentToEditorMessageSchema.safeParse({
			type: "EDITOR_ADD_PREVIEW_ITEM",
			payload: {
				...baseRecordingPayload,
				playback: { kind: "hls", src: "file:///etc/passwd" },
			},
		});
		assert.equal(result.success, false);
	});

	it("rejects non-http/https src in media playback", () => {
		const result = parentToEditorMessageSchema.safeParse({
			type: "EDITOR_ADD_PREVIEW_ITEM",
			payload: {
				kind: "media",
				mediaId: "m-1",
				playback: { kind: "mp4", src: "javascript:alert(1)" },
			},
		});
		assert.equal(result.success, false);
	});

	it("rejects recording-range durationMs exceeding 1 hour", () => {
		const result = parentToEditorMessageSchema.safeParse({
			type: "EDITOR_ADD_PREVIEW_ITEM",
			payload: {
				...baseRecordingPayload,
				durationMs: MAX_MS + 1,
				endTimeMs: baseRecordingPayload.startTimeMs + MAX_MS + 1,
			},
		});
		assert.equal(result.success, false);
	});

	it("accepts recording-range durationMs exactly at the 1-hour cap", () => {
		const result = parentToEditorMessageSchema.safeParse({
			type: "EDITOR_ADD_PREVIEW_ITEM",
			payload: {
				...baseRecordingPayload,
				durationMs: MAX_MS,
				endTimeMs: baseRecordingPayload.startTimeMs + MAX_MS,
			},
		});
		assert.equal(result.success, true);
	});

	it("rejects audio-range durationMs exceeding 1 hour", () => {
		const result = parentToEditorMessageSchema.safeParse({
			type: "EDITOR_ADD_PREVIEW_ITEM",
			payload: {
				...baseAudioPayload,
				durationMs: MAX_MS + 1,
			},
		});
		assert.equal(result.success, false);
	});

	it("rejects media durationMs exceeding 1 hour", () => {
		const result = parentToEditorMessageSchema.safeParse({
			type: "EDITOR_ADD_PREVIEW_ITEM",
			payload: {
				kind: "media",
				mediaId: "m-1",
				durationMs: MAX_MS + 1,
				playback: { kind: "mp4", src: "https://example.com/v.mp4" },
			},
		});
		assert.equal(result.success, false);
	});

	it("rejects audio-range with non-hls src that is not audio media", () => {
		const result = parentToEditorMessageSchema.safeParse({
			type: "EDITOR_ADD_PREVIEW_ITEM",
			payload: {
				...baseAudioPayload,
				playback: { kind: "audio", src: "https://example.com/track.mp4" },
			},
		});
		assert.equal(result.success, false);
	});

	it("accepts audio-range with hls src that looks like video", () => {
		const result = parentToEditorMessageSchema.safeParse({
			type: "EDITOR_ADD_PREVIEW_ITEM",
			payload: {
				...baseAudioPayload,
				playback: { kind: "hls", src: "https://example.com/video.m3u8" },
			},
		});
		assert.equal(result.success, true);
	});
});

describe("from-parent — schema invariants", () => {
	it("parses valid add-preview-item messages", () => {
		assert.equal(parentToEditorMessageSchema.safeParse(mockRecordingRangeHlsMessage).success, true);
		assert.equal(parentToEditorMessageSchema.safeParse(mockMediaMp4Message).success, true);
		assert.equal(parentToEditorMessageSchema.safeParse(mockMediaHlsMessage).success, true);
		assert.equal(parentToEditorMessageSchema.safeParse(mockAudioRangeMessage).success, true);
	});

	it("accepts recording-range without playback (editor resolves HLS URL)", () => {
		assert.equal(
			parentToEditorMessageSchema.safeParse(mockRecordingRangeNoPlaybackMessage).success,
			true,
		);
	});

	it("parses valid clear-project messages", () => {
		assert.equal(parentToEditorMessageSchema.safeParse(mockClearProjectMessage).success, true);
	});

	it("rejects invalid message shapes", () => {
		assert.equal(
			parentToEditorMessageSchema.safeParse({
				type: "EDITOR_ADD_PREVIEW_ITEM",
				requestId: "bad",
			}).success,
			false,
		);
	});

	it("rejects durationMs = 0 for recording-range", () => {
		assert.equal(
			parentToEditorMessageSchema.safeParse({
				type: "EDITOR_ADD_PREVIEW_ITEM",
				payload: { ...baseRecordingPayload, durationMs: 0 },
			}).success,
			false,
		);
	});

	it("rejects durationMs = 0 for audio-range", () => {
		assert.equal(
			parentToEditorMessageSchema.safeParse({
				type: "EDITOR_ADD_PREVIEW_ITEM",
				payload: { ...baseAudioPayload, durationMs: 0 },
			}).success,
			false,
		);
	});

	it("rejects endTimeMs < startTimeMs for recording-range", () => {
		assert.equal(
			parentToEditorMessageSchema.safeParse({
				type: "EDITOR_ADD_PREVIEW_ITEM",
				payload: { ...baseRecordingPayload, startTimeMs: 100, endTimeMs: 99 },
			}).success,
			false,
		);
	});

	it("rejects endTimeMs === startTimeMs (zero duration range) for recording-range", () => {
		assert.equal(
			parentToEditorMessageSchema.safeParse({
				type: "EDITOR_ADD_PREVIEW_ITEM",
				payload: { ...baseRecordingPayload, startTimeMs: 100, endTimeMs: 100 },
			}).success,
			false,
		);
	});

	it("rejects endTimeMs === startTimeMs for audio-range", () => {
		assert.equal(
			parentToEditorMessageSchema.safeParse({
				type: "EDITOR_ADD_PREVIEW_ITEM",
				payload: { ...baseAudioPayload, startTimeMs: 100, endTimeMs: 100 },
			}).success,
			false,
		);
	});

	it("accepts sourceOffsetMs = 0 (valid boundary)", () => {
		assert.equal(
			parentToEditorMessageSchema.safeParse({
				type: "EDITOR_ADD_PREVIEW_ITEM",
				payload: { ...baseRecordingPayload, sourceOffsetMs: 0 },
			}).success,
			true,
		);
	});

	it("rejects sourceOffsetMs > durationMs", () => {
		assert.equal(
			parentToEditorMessageSchema.safeParse({
				type: "EDITOR_ADD_PREVIEW_ITEM",
				payload: {
					...baseRecordingPayload,
					durationMs: 1000,
					sourceOffsetMs: 1001,
				},
			}).success,
			false,
		);
	});

	it("keeps all exported mocks schema-valid", () => {
		for (const message of [
			mockRecordingRangeHlsMessage,
			mockRecordingRangeNoPlaybackMessage,
			mockMediaMp4Message,
			mockMediaHlsMessage,
			mockAudioRangeMessage,
			mockClearProjectMessage,
		]) {
			assert.equal(
				parentToEditorMessageSchema.safeParse(message).success,
				true,
				`Mock failed schema validation: ${JSON.stringify(message)}`,
			);
		}
	});
});
