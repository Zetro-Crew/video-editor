import { describe, expect, it } from "vitest";
import { buildTextOverlayFilter } from "../text-overlay.service.ts";

const makeOverlay = (overrides: Record<string, unknown> = {}) => ({
	id: "t1",
	type: "text" as const,
	text: "hello world",
	start: 0,
	end: 5,
	trackOrder: 1,
	x: 0,
	y: 0,
	canvasWidth: 1920,
	canvasHeight: 1080,
	textAlign: "left" as const,
	...overrides,
});

function extractTextParam(filter: string): string {
	const match = /text='((?:[^'\\]|\\.)*)'/.exec(filter);
	return match?.[1] ?? "";
}

describe("buildTextOverlayFilter", () => {
	it("wraps Hebrew text at word boundary (RTL char factor)", () => {
		// Hebrew "כותרת וגוף טקסט" — 3 words, fontSize=100, elementWidth=600
		// With 0.45 RTL factor: maxChars = floor(600/45) = 13
		// "כותרת וגוף טקסט"(15) > 13 → must wrap at word boundary
		const filter = buildTextOverlayFilter(
			makeOverlay({
				text: "כותרת וגוף טקסט",
				fontSize: 100,
				elementWidth: 600,
			}),
			"[base]",
			"out",
		);
		const extracted = extractTextParam(filter);
		// After RTL char reversal, newline character must be present (wrapping happened)
		expect(extracted).toContain("\n");
	});

	it("reverses word order within RTL line so FFmpeg LTR renders correct reading order", () => {
		// "כותרת וגוף" fits on one line (10 chars ≤ maxChars=13). After prepareRTLText:
		// words reversed: ["וגוף","כותרת"] → chars reversed: "ףוגו תרתוכ"
		// FFmpeg LTR renders "ףוגו" left and "תרתוכ" right → Hebrew reader RTL sees "כותרת וגוף" ✓
		const filter = buildTextOverlayFilter(
			makeOverlay({
				text: "כותרת וגוף",
				fontSize: 100,
				elementWidth: 600,
			}),
			"[base]",
			"out",
		);
		const extracted = extractTextParam(filter);
		expect(extracted).toBe("ףוגו תרתוכ");
	});

	it("centers text using video frame width W not text_w for elementWidth", () => {
		// textAlign=center: x = xBase + (W*elementWidth/canvasWidth - text_w) / 2
		// Bug: using lowercase w (text bounding-box) instead of W (frame width)
		const filter = buildTextOverlayFilter(
			makeOverlay({
				text: "hello",
				textAlign: "center" as const,
				elementWidth: 960,
				canvasWidth: 1920,
			}),
			"[base]",
			"out",
		);
		expect(filter).toContain("W*960/1920");
		expect(filter).not.toMatch(/[^W]w\*960\/1920/);
	});

	it("right-aligns text using video frame width W not text_w for elementWidth", () => {
		const filter = buildTextOverlayFilter(
			makeOverlay({
				text: "hello",
				textAlign: "right" as const,
				elementWidth: 960,
				canvasWidth: 1920,
			}),
			"[base]",
			"out",
		);
		expect(filter).toContain("W*960/1920");
	});

	it("generates per-line drawtext filters with distinct x positions for multi-line center-aligned text", () => {
		// "כותרת וגוף טקסט" wraps to 2 lines at fontSize=100, elementWidth=600 (maxChars=13)
		// After RTL prep: line0="ףוגו תרתוכ" (10 chars), line1="טסקט" (4 chars)
		// canvasLeftPx = 34.375/100*1920 = 660
		// Line 0 widthEst = 10*100*0.45 = 450 → x = 660+(600-450)/2 = 735 → W*735/1920
		// Line 1 widthEst = 4*100*0.45  = 180 → x = 660+(600-180)/2 = 870 → W*870/1920
		// Line 1 y offset = 100*1.2 = 120 → H*120/1080
		const filter = buildTextOverlayFilter(
			makeOverlay({
				text: "כותרת וגוף טקסט",
				textAlign: "center" as const,
				fontSize: 100,
				elementWidth: 600,
				x: 34.375, // 660/1920 * 100
				y: 0,
				canvasWidth: 1920,
				canvasHeight: 1080,
			}),
			"[base]",
			"out",
		);
		// Two drawtext filters chained
		expect(filter).toContain(";");
		expect(filter).toContain("W*735/1920");
		expect(filter).toContain("W*870/1920");
		expect(filter).toContain("H*120/1080");
	});

	it("left-aligned multi-line text uses single drawtext (no per-line splitting)", () => {
		const filter = buildTextOverlayFilter(
			makeOverlay({
				text: "כותרת וגוף טקסט",
				textAlign: "left" as const,
				fontSize: 100,
				elementWidth: 600,
			}),
			"[base]",
			"out",
		);
		// Single drawtext — no semicolon separator
		expect(filter).not.toContain(";");
	});

	it("does not over-wrap Latin text at same fontSize and elementWidth", () => {
		// Latin text — 2 short words that fit within 600px at fontSize=100
		// 0.55 factor: maxChars = floor(600/55) = 10, "hi there"(8) ≤ 10 → no wrap
		const filter = buildTextOverlayFilter(
			makeOverlay({
				text: "hi there",
				fontSize: 100,
				elementWidth: 600,
			}),
			"[base]",
			"out",
		);
		const extracted = extractTextParam(filter);
		expect(extracted).not.toContain("\n");
	});
});
