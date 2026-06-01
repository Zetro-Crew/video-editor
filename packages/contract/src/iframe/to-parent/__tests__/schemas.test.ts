import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
