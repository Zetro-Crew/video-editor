import { describe, expect, it } from "vitest";
import { buildWatermarkFilterParts } from "../watermark.service.ts";

describe("buildWatermarkFilterParts", () => {
	it("returns 3 filter parts", () => {
		const parts = buildWatermarkFilterParts("[0:v]", 3, "wmout");
		expect(parts).toHaveLength(3);
	});

	it("first part loops the given logo input index", () => {
		const parts = buildWatermarkFilterParts("[0:v]", 5, "wmout");
		expect(parts[0]).toMatch(/^\[5:v\]loop=/);
	});

	it("second part scales the logo", () => {
		const parts = buildWatermarkFilterParts("[0:v]", 3, "wmout");
		expect(parts[1]).toContain("scale=");
		expect(parts[1]).toContain("force_original_aspect_ratio=decrease");
	});

	it("third part overlays logo right-aligned using current stream", () => {
		const parts = buildWatermarkFilterParts("[prevStream]", 3, "wmout");
		expect(parts[2]).toContain("[prevStream]");
		expect(parts[2]).toContain("overlay=");
		expect(parts[2]).toContain("W-overlay_w-");
	});

	it("third part uses given output label", () => {
		const parts = buildWatermarkFilterParts("[0:v]", 3, "wmout");
		expect(parts[2]).toMatch(/\[wmout\]$/);
	});

	it("overlay filter includes shortest=1 to prevent hang on video-only content without audio", () => {
		const parts = buildWatermarkFilterParts("[0:v]", 3, "wmout");
		expect(parts[2]).toContain("shortest=1");
	});
});
