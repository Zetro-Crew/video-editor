import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	audioSourceSchema,
	imageOverlaySchema,
	rectangleOverlaySchema,
	shapeOverlaySchema,
	textOverlaySchema,
	videoOverlaySchema,
} from "../schemas.js";

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

	// Shape overlays are unclamped — off-canvas positions are intentional (translator
	// computes raw percent without Math.max/min so shapes can scroll/animate from outside
	// the canvas). See DesignToRenderJobTranslator.ts shape branch.
	it("accepts x > 100", () => {
		const result = shapeOverlaySchema.safeParse({ ...baseShape, x: 150, y: 0 });
		assert.equal(result.success, true);
	});

	it("accepts negative y", () => {
		const result = shapeOverlaySchema.safeParse({ ...baseShape, x: 0, y: -25 });
		assert.equal(result.success, true);
	});

	it("accepts x/y within 0..100", () => {
		const result = shapeOverlaySchema.safeParse({ ...baseShape, x: 50, y: 50 });
		assert.equal(result.success, true);
	});
});

describe("overlay id accepts non-UUID strings", () => {
	// Designcombo trackItem ids are nanoid-style (e.g. "565c34cn"), not UUIDs.
	// Translator forwards them directly; schema must accept them.
	const designcomboId = "565c34cn";

	it("textOverlaySchema accepts designcombo-style id", () => {
		const result = textOverlaySchema.safeParse({
			id: designcomboId,
			type: "text",
			text: "hello",
			start: 0,
			end: 1,
			x: 0,
			y: 0,
		});
		assert.equal(result.success, true);
	});

	it("imageOverlaySchema accepts designcombo-style id", () => {
		const result = imageOverlaySchema.safeParse({
			id: designcomboId,
			type: "image",
			imageUrl: "https://example.com/img.png",
			start: 0,
			end: 1,
			x: 0,
			y: 0,
		});
		assert.equal(result.success, true);
	});

	it("videoOverlaySchema accepts designcombo-style id", () => {
		const result = videoOverlaySchema.safeParse({
			id: designcomboId,
			type: "video",
			sourceUrl: "https://example.com/clip.mp4",
			start: 0,
			end: 1,
			left: 0,
			top: 0,
		});
		assert.equal(result.success, true);
	});

	it("rectangleOverlaySchema accepts designcombo-style id", () => {
		const result = rectangleOverlaySchema.safeParse({
			id: designcomboId,
			type: "rectangle",
			start: 0,
			end: 1,
			x: 0,
			y: 0,
		});
		assert.equal(result.success, true);
	});

	it("shapeOverlaySchema accepts designcombo-style id", () => {
		const result = shapeOverlaySchema.safeParse({
			id: designcomboId,
			type: "shape",
			svgData: "<svg/>",
			start: 0,
			end: 1,
			x: 0,
			y: 0,
		});
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
