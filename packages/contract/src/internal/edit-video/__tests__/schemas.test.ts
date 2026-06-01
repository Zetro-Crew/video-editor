import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	audioSourceSchema,
	editVideoRequestSchema,
	shapeOverlaySchema,
	videoOverlaySchema,
} from "../schemas.js";

const validSource = {
	url: "https://example.com/in.mp4",
	type: "video" as const,
};

const minimalEditVideoBody = {
	sources: [validSource],
	trimEnd: 10,
	jobId: "job-1",
};

describe("editVideoRequestSchema defaults", () => {
	it("injects defaults for cuts/overlays/audioSources/format/audioMixMode", () => {
		const parsed = editVideoRequestSchema.parse(minimalEditVideoBody);
		assert.deepEqual(parsed.cuts, []);
		assert.deepEqual(parsed.overlays, []);
		assert.deepEqual(parsed.audioSources, []);
		assert.equal(parsed.format, "mp4");
		assert.equal(parsed.audioMixMode, "mix");
	});

	it("cropRegion width must be >= 2", () => {
		const result = editVideoRequestSchema.safeParse({
			...minimalEditVideoBody,
			cropRegion: { x: 0, y: 0, width: 1, height: 5 },
		});
		assert.equal(result.success, false);
	});

	it("cropRegion accepts width/height >= 2", () => {
		const result = editVideoRequestSchema.safeParse({
			...minimalEditVideoBody,
			cropRegion: { x: 0, y: 0, width: 2, height: 2 },
		});
		assert.equal(result.success, true);
	});
});

describe("videoOverlaySchema trackOrder", () => {
	it("accepts payload without trackOrder (now optional)", () => {
		const result = videoOverlaySchema.safeParse({
			id: "11111111-1111-4111-8111-111111111111",
			type: "video",
			sourceUrl: "https://example.com/clip.mp4",
			start: 0,
			end: 1,
			left: 0,
			top: 0,
		});
		assert.equal(result.success, true);
	});
});

describe("shapeOverlaySchema x/y bounds", () => {
	const baseShape = {
		id: "11111111-1111-4111-8111-111111111112",
		type: "shape" as const,
		svgData: "<svg/>",
		start: 0,
		end: 1,
	};

	it("rejects x > 100", () => {
		const result = shapeOverlaySchema.safeParse({ ...baseShape, x: 150, y: 0 });
		assert.equal(result.success, false);
	});

	it("rejects y > 100", () => {
		const result = shapeOverlaySchema.safeParse({ ...baseShape, x: 0, y: 150 });
		assert.equal(result.success, false);
	});

	it("accepts x/y within 0..100", () => {
		const result = shapeOverlaySchema.safeParse({ ...baseShape, x: 50, y: 50 });
		assert.equal(result.success, true);
	});
});

describe("audioSourceSchema volume default", () => {
	it("defaults volume to 1 when omitted", () => {
		const parsed = audioSourceSchema.parse({
			url: "https://example.com/track.m4a",
			startTime: 0,
			duration: 5,
		});
		assert.equal(parsed.volume, 1);
	});
});
