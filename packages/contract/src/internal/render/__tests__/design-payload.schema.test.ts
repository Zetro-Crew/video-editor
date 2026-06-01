import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { designPayloadSchema } from "../design-payload.schema.js";

const minimalPayload = {
	size: { width: 1920, height: 1080 },
	fps: 30,
	tracks: [],
	trackItemIds: [],
	trackItemsMap: {},
};

describe("designPayloadSchema trackItemsMap RENDERABLE_TYPES filter", () => {
	it("drops items whose type is not in the renderable set", () => {
		const parsed = designPayloadSchema.parse({
			...minimalPayload,
			id: "design-1",
			trackItemsMap: {
				a: {
					id: "a",
					type: "comment",
					display: { from: 0, to: 1000 },
				},
				b: {
					id: "b",
					type: "video",
					display: { from: 0, to: 1000 },
				},
			},
		});
		assert.deepEqual(Object.keys(parsed.trackItemsMap), ["b"]);
	});
});

describe("designPayloadSchema parsePx", () => {
	it("treats empty string as missing and applies default(0) (regression: was NaN)", () => {
		const parsed = designPayloadSchema.parse({
			...minimalPayload,
			id: "design-1",
			trackItemsMap: {
				b: {
					id: "b",
					type: "video",
					display: { from: 0, to: 1000 },
					details: { left: "", top: "", width: "", height: "" },
				},
			},
		});
		const item = parsed.trackItemsMap.b as { details: { left: number; top: number } };
		assert.equal(item.details.left, 0);
		assert.equal(item.details.top, 0);
	});

	it("parses numeric strings like '123.5px' to a number", () => {
		const parsed = designPayloadSchema.parse({
			...minimalPayload,
			id: "design-1",
			trackItemsMap: {
				b: {
					id: "b",
					type: "video",
					display: { from: 0, to: 1000 },
					details: { left: "123.5px", top: 0, width: 0, height: 0 },
				},
			},
		});
		const item = parsed.trackItemsMap.b as { details: { left: number } };
		assert.equal(item.details.left, 123.5);
	});
});

describe("designPayloadSchema id union", () => {
	it("accepts string id", () => {
		assert.equal(designPayloadSchema.safeParse({ ...minimalPayload, id: "abc" }).success, true);
	});

	it("accepts numeric id", () => {
		assert.equal(designPayloadSchema.safeParse({ ...minimalPayload, id: 42 }).success, true);
	});
});

describe("videoDetailsSchema volume coercion", () => {
	it("coerces string '100' to 100", () => {
		const parsed = designPayloadSchema.parse({
			...minimalPayload,
			id: "x",
			trackItemsMap: {
				b: {
					id: "b",
					type: "video",
					display: { from: 0, to: 1000 },
					details: { left: 0, top: 0, width: 0, height: 0, volume: "100" },
				},
			},
		});
		const item = parsed.trackItemsMap.b as { details: { volume: number } };
		assert.equal(item.details.volume, 100);
	});
});
