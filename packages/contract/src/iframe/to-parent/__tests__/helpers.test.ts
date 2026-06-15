import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SavedMediaItem } from "../../../shared/saved-media.js";
import {
	createMediaSavedMessage,
	createPreviewItemAddedMessage,
	createPreviewItemRejectedMessage,
	createProjectClearedMessage,
} from "../helpers.js";

describe("createPreviewItemAddedMessage", () => {
	it("builds message with itemId and requestId", () => {
		assert.deepEqual(createPreviewItemAddedMessage("id", { requestId: "req" }), {
			type: "EDITOR_PREVIEW_ITEM_ADDED",
			itemId: "id",
			requestId: "req",
			mediaId: undefined,
		});
	});

	it("builds message with itemId and mediaId echo", () => {
		assert.deepEqual(createPreviewItemAddedMessage("id", { mediaId: "media-1" }), {
			type: "EDITOR_PREVIEW_ITEM_ADDED",
			itemId: "id",
			requestId: undefined,
			mediaId: "media-1",
		});
	});

	it("correlation fields undefined when omitted", () => {
		const msg = createPreviewItemAddedMessage("id");
		assert.equal(msg.requestId, undefined);
		assert.equal(msg.mediaId, undefined);
	});
});

describe("createPreviewItemRejectedMessage", () => {
	it("builds message with reason and requestId", () => {
		assert.deepEqual(createPreviewItemRejectedMessage("nope", { requestId: "req" }), {
			type: "EDITOR_PREVIEW_ITEM_REJECTED",
			reason: "nope",
			requestId: "req",
			mediaId: undefined,
		});
	});

	it("builds message with reason and mediaId echo", () => {
		assert.deepEqual(createPreviewItemRejectedMessage("nope", { mediaId: "bogus" }), {
			type: "EDITOR_PREVIEW_ITEM_REJECTED",
			reason: "nope",
			requestId: undefined,
			mediaId: "bogus",
		});
	});

	it("correlation fields undefined when omitted", () => {
		assert.deepEqual(createPreviewItemRejectedMessage("reason"), {
			type: "EDITOR_PREVIEW_ITEM_REJECTED",
			reason: "reason",
			requestId: undefined,
			mediaId: undefined,
		});
	});
});

describe("createProjectClearedMessage", () => {
	it("includes requestId when provided", () => {
		assert.deepEqual(createProjectClearedMessage("req"), {
			type: "EDITOR_PROJECT_CLEARED",
			requestId: "req",
		});
	});
});

describe("createMediaSavedMessage", () => {
	it("maps positional args to named fields without swaps", () => {
		const items: SavedMediaItem[] = [{ type: "image", id: "img-1" }];
		const result = createMediaSavedMessage(
			"clip-name",
			false,
			true,
			"https://x.example/a.mp4",
			"mp4",
			items,
			"media-1",
			["ch-a", "ch-b"],
		);
		assert.equal(result.type, "EDITOR_MEDIA_SAVED");
		assert.equal(result.mediaName, "clip-name");
		assert.equal(result.downloadToComputer, false);
		assert.equal(result.saveToPersonalChannel, true);
		assert.equal(result.url, "https://x.example/a.mp4");
		assert.equal(result.exportType, "mp4");
		assert.deepEqual(result.items, items);
		assert.equal(result.mediaId, "media-1");
		assert.deepEqual(result.selectedUnitChannelIds, ["ch-a", "ch-b"]);
	});
});
