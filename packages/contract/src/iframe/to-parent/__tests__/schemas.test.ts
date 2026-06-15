import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPreviewItemAddedMessage, createPreviewItemRejectedMessage } from "../helpers.js";
import { mockMediaSavedMessage } from "../mocks.js";
import { editorToParentMessageSchema } from "../schemas.js";

describe("to-parent — editorMediaSavedMessageSchema", () => {
	const validMsg = {
		type: "EDITOR_MEDIA_SAVED",
		mediaId: "550e8400-e29b-41d4-a716-446655440000",
		mediaName: "My Clip",
		downloadToComputer: true,
		saveToPersonalChannel: false,
		selectedUnitChannelIds: [],
		url: "https://example.com/output/video.mp4",
		exportType: "mp4",
		items: [
			{ type: "recording", id: "ch-1", from: 0, to: 5000 },
			{ type: "audio", id: "aud-1", from: 1000, to: 4000 },
			{ type: "image", id: "img-1" },
			{ type: "clip", id: "media-1" },
		],
	};

	it("accepts a valid EDITOR_MEDIA_SAVED message", () => {
		assert.equal(editorToParentMessageSchema.safeParse(validMsg).success, true);
	});

	it("rejects missing mediaName", () => {
		const { mediaName: _m, ...rest } = validMsg;
		assert.equal(editorToParentMessageSchema.safeParse(rest).success, false);
	});

	it("rejects non-http url", () => {
		assert.equal(
			editorToParentMessageSchema.safeParse({ ...validMsg, url: "ftp://bad.com/x.mp4" }).success,
			false,
		);
	});

	it("rejects unknown exportType", () => {
		assert.equal(
			editorToParentMessageSchema.safeParse({ ...validMsg, exportType: "json" }).success,
			false,
		);
	});

	it("rejects recording item missing from/to", () => {
		assert.equal(
			editorToParentMessageSchema.safeParse({
				...validMsg,
				items: [{ type: "recording", id: "ch-1" }],
			}).success,
			false,
		);
	});

	it("accepts empty items array", () => {
		assert.equal(editorToParentMessageSchema.safeParse({ ...validMsg, items: [] }).success, true);
	});

	it("rejects EDITOR_MEDIA_SAVED without mediaId", () => {
		const { mediaId: _m, ...withoutMediaId } = validMsg as typeof validMsg & { mediaId: string };
		assert.equal(editorToParentMessageSchema.safeParse(withoutMediaId).success, false);
	});

	it("rejects EDITOR_MEDIA_SAVED without selectedUnitChannelIds", () => {
		const { selectedUnitChannelIds: _s, ...withoutChannels } = validMsg as typeof validMsg & {
			selectedUnitChannelIds: string[];
		};
		assert.equal(editorToParentMessageSchema.safeParse(withoutChannels).success, false);
	});

	it("accepts EDITOR_MEDIA_SAVED with mediaId and selectedUnitChannelIds", () => {
		assert.equal(
			editorToParentMessageSchema.safeParse({
				...validMsg,
				mediaId: "550e8400-e29b-41d4-a716-446655440000",
				selectedUnitChannelIds: ["ch-1", "ch-2"],
			}).success,
			true,
		);
	});

	it("accepts EDITOR_MEDIA_SAVED with empty selectedUnitChannelIds", () => {
		assert.equal(
			editorToParentMessageSchema.safeParse({
				...validMsg,
				mediaId: "550e8400-e29b-41d4-a716-446655440000",
				selectedUnitChannelIds: [],
			}).success,
			true,
		);
	});

	it("keeps the exported mock schema-valid", () => {
		assert.equal(editorToParentMessageSchema.safeParse(mockMediaSavedMessage).success, true);
	});
});

describe("to-parent — preview-item correlation (mediaId echo)", () => {
	it("accepts EDITOR_PREVIEW_ITEM_ADDED with mediaId echo and no requestId", () => {
		const msg = createPreviewItemAddedMessage("item-xyz", { mediaId: "img-001" });
		const result = editorToParentMessageSchema.safeParse(msg);
		assert.equal(result.success, true);
		if (result.success && result.data.type === "EDITOR_PREVIEW_ITEM_ADDED") {
			assert.equal(result.data.mediaId, "img-001");
			assert.equal(result.data.requestId, undefined);
		}
	});

	it("accepts EDITOR_PREVIEW_ITEM_ADDED with requestId and no mediaId", () => {
		const msg = createPreviewItemAddedMessage("item-xyz", { requestId: "req-1" });
		const result = editorToParentMessageSchema.safeParse(msg);
		assert.equal(result.success, true);
	});

	it("accepts EDITOR_PREVIEW_ITEM_ADDED with neither correlation field", () => {
		const msg = createPreviewItemAddedMessage("item-xyz");
		const result = editorToParentMessageSchema.safeParse(msg);
		assert.equal(result.success, true);
	});

	it("accepts EDITOR_PREVIEW_ITEM_REJECTED with mediaId echo", () => {
		const msg = createPreviewItemRejectedMessage("media not found", { mediaId: "bogus" });
		const result = editorToParentMessageSchema.safeParse(msg);
		assert.equal(result.success, true);
		if (result.success && result.data.type === "EDITOR_PREVIEW_ITEM_REJECTED") {
			assert.equal(result.data.mediaId, "bogus");
			assert.equal(result.data.reason, "media not found");
		}
	});

	it("rejects EDITOR_PREVIEW_ITEM_ADDED with empty mediaId", () => {
		const result = editorToParentMessageSchema.safeParse({
			type: "EDITOR_PREVIEW_ITEM_ADDED",
			itemId: "item-xyz",
			mediaId: "  ",
		});
		assert.equal(result.success, false);
	});
});
