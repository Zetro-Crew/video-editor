import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { savedMediaItemSchema, savedMediaPayloadSchema } from "../saved-media.js";

describe("savedMediaItemSchema", () => {
	it("accepts image item", () => {
		assert.equal(savedMediaItemSchema.safeParse({ type: "image", id: "img-1" }).success, true);
	});

	it("accepts clip item", () => {
		assert.equal(savedMediaItemSchema.safeParse({ type: "clip", id: "clip-1" }).success, true);
	});

	it("accepts recording with from/to", () => {
		assert.equal(
			savedMediaItemSchema.safeParse({ type: "recording", id: "ch-1", from: 0, to: 100 }).success,
			true,
		);
	});

	it("accepts audio with from/to", () => {
		assert.equal(
			savedMediaItemSchema.safeParse({ type: "audio", id: "aud-1", from: 0, to: 100 }).success,
			true,
		);
	});

	it("rejects recording missing from/to", () => {
		assert.equal(savedMediaItemSchema.safeParse({ type: "recording", id: "ch-1" }).success, false);
	});

	it("rejects unknown type", () => {
		assert.equal(savedMediaItemSchema.safeParse({ type: "foo", id: "x" }).success, false);
	});
});

describe("savedMediaPayloadSchema", () => {
	const valid = {
		mediaId: "550e8400-e29b-41d4-a716-446655440000",
		mediaName: "Clip A",
		downloadToComputer: true,
		saveToPersonalChannel: false,
		selectedUnitChannelIds: [],
		exportType: "mp4",
		items: [{ type: "image", id: "img-1" }],
	};

	it("accepts a valid payload", () => {
		assert.equal(savedMediaPayloadSchema.safeParse(valid).success, true);
	});

	it("rejects missing mediaName", () => {
		const { mediaName: _m, ...rest } = valid;
		assert.equal(savedMediaPayloadSchema.safeParse(rest).success, false);
	});

	it("rejects unknown exportType", () => {
		assert.equal(
			savedMediaPayloadSchema.safeParse({ ...valid, exportType: "json" }).success,
			false,
		);
	});
});
