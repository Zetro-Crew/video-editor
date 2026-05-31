import type { ITrackItem } from "@designcombo/types";
import { savedMediaItemSchema } from "@video-editor/contract";
import { describe, expect, it } from "vitest";
import { extractSavedItems } from "../extract-saved-items";

const makeItem = (overrides: Partial<ITrackItem>): ITrackItem =>
	({
		id: "item-1",
		type: "video",
		name: "video",
		display: { from: 0, to: 5000 },
		duration: 5000,
		metadata: {},
		...overrides,
	}) as ITrackItem;

describe("extractSavedItems", () => {
	it("returns empty array for empty map", () => {
		expect(extractSavedItems({})).toEqual([]);
	});

	it("maps image item", () => {
		const items = { img1: makeItem({ id: "img1", type: "image" }) };
		expect(extractSavedItems(items)).toEqual([{ type: "image", id: "img1" }]);
	});

	it("maps recording-range item using channelId", () => {
		const items = {
			v1: makeItem({
				id: "v1",
				type: "video",
				display: { from: 1000, to: 6000 },
				metadata: { externalKind: "recording-range", channelId: "ch-99" },
			}),
		};
		expect(extractSavedItems(items)).toEqual([
			{ type: "recording", id: "ch-99", from: 1000, to: 6000 },
		]);
	});

	it("collapses split recording parts into one entry with min from and max to", () => {
		const items = {
			v1: makeItem({
				id: "v1",
				type: "video",
				display: { from: 0, to: 3000 },
				metadata: { externalKind: "recording-range", channelId: "ch-1" },
			}),
			v2: makeItem({
				id: "v2",
				type: "video",
				display: { from: 5000, to: 8000 },
				metadata: { externalKind: "recording-range", channelId: "ch-1" },
			}),
			v3: makeItem({
				id: "v3",
				type: "video",
				display: { from: 10000, to: 15000 },
				metadata: { externalKind: "recording-range", channelId: "ch-1" },
			}),
		};
		expect(extractSavedItems(items)).toEqual([
			{ type: "recording", id: "ch-1", from: 0, to: 15000 },
		]);
	});

	it("collapses split audio parts by audioId", () => {
		const items = {
			a1: makeItem({
				id: "a1",
				type: "audio",
				display: { from: 2000, to: 5000 },
				metadata: { externalKind: "audio-range", audioId: "aud-7" },
			}),
			a2: makeItem({
				id: "a2",
				type: "audio",
				display: { from: 7000, to: 11000 },
				metadata: { externalKind: "audio-range", audioId: "aud-7" },
			}),
		};
		expect(extractSavedItems(items)).toEqual([
			{ type: "audio", id: "aud-7", from: 2000, to: 11000 },
		]);
	});

	it("maps media clip by mediaId", () => {
		const items = {
			v1: makeItem({
				id: "v1",
				type: "video",
				metadata: { externalKind: "media", mediaId: "media-42" },
			}),
		};
		expect(extractSavedItems(items)).toEqual([{ type: "clip", id: "media-42" }]);
	});

	it("maps native video clip (no externalKind) by item id", () => {
		const items = {
			v1: makeItem({ id: "v1", type: "video", metadata: {} }),
		};
		expect(extractSavedItems(items)).toEqual([{ type: "clip", id: "v1" }]);
	});

	it("handles mixed types: recording + audio + image + clip", () => {
		const items = {
			img1: makeItem({ id: "img1", type: "image" }),
			v1: makeItem({
				id: "v1",
				type: "video",
				display: { from: 0, to: 5000 },
				metadata: { externalKind: "recording-range", channelId: "ch-1" },
			}),
			a1: makeItem({
				id: "a1",
				type: "audio",
				display: { from: 0, to: 5000 },
				metadata: { externalKind: "audio-range", audioId: "aud-1" },
			}),
			v2: makeItem({
				id: "v2",
				type: "video",
				metadata: { externalKind: "media", mediaId: "media-1" },
			}),
		};
		const result = extractSavedItems(items);
		expect(result).toHaveLength(4);
		expect(result).toContainEqual({ type: "image", id: "img1" });
		expect(result).toContainEqual({ type: "recording", id: "ch-1", from: 0, to: 5000 });
		expect(result).toContainEqual({ type: "audio", id: "aud-1", from: 0, to: 5000 });
		expect(result).toContainEqual({ type: "clip", id: "media-1" });
	});

	it("falls back to item id when audioId missing", () => {
		const items = {
			a1: makeItem({ id: "a1", type: "audio", display: { from: 0, to: 3000 }, metadata: {} }),
		};
		expect(extractSavedItems(items)).toEqual([{ type: "audio", id: "a1", from: 0, to: 3000 }]);
	});

	it("falls back to item id when channelId missing", () => {
		const items = {
			v1: makeItem({
				id: "v1",
				type: "video",
				display: { from: 0, to: 3000 },
				metadata: { externalKind: "recording-range" },
			}),
		};
		expect(extractSavedItems(items)).toEqual([{ type: "recording", id: "v1", from: 0, to: 3000 }]);
	});

	it("output validates against savedMediaItemSchema.array()", () => {
		const items = {
			img1: makeItem({ id: "img1", type: "image" }),
			v_rec: makeItem({
				id: "v_rec",
				type: "video",
				display: { from: 0, to: 5000 },
				metadata: { externalKind: "recording-range", channelId: "ch-1" },
			}),
			a1: makeItem({
				id: "a1",
				type: "audio",
				display: { from: 1000, to: 4000 },
				metadata: { externalKind: "audio-range", audioId: "aud-1" },
			}),
			v_clip: makeItem({
				id: "v_clip",
				type: "video",
				metadata: { externalKind: "media", mediaId: "media-9" },
			}),
		};
		const result = extractSavedItems(items);
		const parsed = savedMediaItemSchema.array().safeParse(result);
		expect(parsed.success).toBe(true);
	});
});
