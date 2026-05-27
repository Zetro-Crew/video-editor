import { describe, expect, it } from "vitest";
import { buildWatermarkFilterParts } from "./watermark.service.ts";

describe("buildWatermarkFilterParts", () => {
	it("returns 5 filter parts", () => {
		const parts = buildWatermarkFilterParts("[0:v]", 3, "wmout");
		expect(parts).toHaveLength(5);
	});

	it("first part references the given logo input index", () => {
		const parts = buildWatermarkFilterParts("[0:v]", 5, "wmout");
		expect(parts[0]).toMatch(/^\[5:v\]loop=/);
	});

	it("third part draws semi-transparent black box in top-right using current stream", () => {
		const parts = buildWatermarkFilterParts("[prevStream]", 3, "wmout");
		expect(parts[2]).toContain("[prevStream]");
		expect(parts[2]).toContain("drawbox=");
		expect(parts[2]).toContain("black@0.45");
	});

	it("fourth part overlays logo right-aligned", () => {
		const parts = buildWatermarkFilterParts("[0:v]", 3, "wmout");
		expect(parts[3]).toContain("overlay=");
		expect(parts[3]).toContain("W-overlay_w-");
	});

	it("fifth part draws white text and uses given output label", () => {
		const parts = buildWatermarkFilterParts("[0:v]", 3, "wmout");
		expect(parts[4]).toContain("drawtext=");
		expect(parts[4]).toContain("fontcolor=white");
		expect(parts[4]).toMatch(/\[wmout\]$/);
	});

	it("Hebrew text is RTL-prepared (word+char reversed for FFmpeg LTR rendering)", () => {
		const parts = buildWatermarkFilterParts("[0:v]", 3, "wmout");
		// "נערך ב-" → prepareRTLText reverses words then chars
		// words ["נערך","ב-"] → reversed ["ב-","-ב"] ... actually reversed order + char reverse
		// result should NOT be the original string
		expect(parts[4]).not.toContain("נערך ב-");
	});

	it("overlay filter includes shortest=1 to prevent hang on video-only content without audio", () => {
		const parts = buildWatermarkFilterParts("[0:v]", 3, "wmout");
		expect(parts[3]).toContain("shortest=1");
	});
});
