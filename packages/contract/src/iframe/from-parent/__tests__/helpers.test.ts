import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { isParentToEditorMessage, parseParentToEditorMessage } from "../helpers.js";
import {
	mockAudioRangeMessage,
	mockClearProjectMessage,
	mockMediaHlsMessage,
	mockMediaMp4Message,
	mockRecordingRangeHlsMessage,
	mockRecordingRangeNoPlaybackMessage,
} from "../mocks.js";

describe("isParentToEditorMessage", () => {
	it("returns true for every exported mock", () => {
		for (const m of [
			mockRecordingRangeHlsMessage,
			mockRecordingRangeNoPlaybackMessage,
			mockMediaMp4Message,
			mockMediaHlsMessage,
			mockAudioRangeMessage,
			mockClearProjectMessage,
		]) {
			assert.equal(isParentToEditorMessage(m), true);
		}
	});

	it("returns false for legacy EDITOR_SET_AUTH messages", () => {
		assert.equal(isParentToEditorMessage({ type: "EDITOR_SET_AUTH", token: "x" }), false);
	});

	it("returns false for non-objects", () => {
		assert.equal(isParentToEditorMessage(null), false);
		assert.equal(isParentToEditorMessage(undefined), false);
		assert.equal(isParentToEditorMessage("string"), false);
		assert.equal(isParentToEditorMessage(42), false);
	});
});

describe("parseParentToEditorMessage", () => {
	it("returns parsed value for valid input", () => {
		const parsed = parseParentToEditorMessage(mockClearProjectMessage);
		assert.equal(parsed.type, "EDITOR_CLEAR_PROJECT");
	});

	it("throws ZodError on invalid input", () => {
		assert.throws(
			() => parseParentToEditorMessage({}),
			(err) => err instanceof z.ZodError,
		);
	});
});
