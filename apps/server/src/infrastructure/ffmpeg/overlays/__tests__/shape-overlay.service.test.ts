import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildShapeOverlayFilter, prepareShapeOverlay } from "../shape-overlay.service.ts";

const MINIMAL_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>';

function makeOverlay(
	overrides: Partial<{
		id: string;
		svgData: string;
		width: number;
		height: number;
		x: number;
		y: number;
		start: number;
		end: number;
		opacity: number;
		trackOrder: number;
		backgroundColor: string;
		borderColor: string;
		borderWidth: number;
	}> = {},
) {
	return {
		id: "test-shape-id",
		type: "shape" as const,
		svgData: MINIMAL_SVG,
		x: 10,
		y: 20,
		width: 200,
		height: 150,
		start: 1,
		end: 4,
		...overrides,
	};
}

describe("prepareShapeOverlay", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "shape-overlay-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("renders raw SVG string to a PNG file and returns the path", async () => {
		const overlay = makeOverlay({ svgData: MINIMAL_SVG });
		const outPath = await prepareShapeOverlay(overlay, tempDir);

		expect(outPath).toMatch(/shape-overlay-test-shape-id\.png$/);
		const files = await readdir(tempDir);
		expect(files).toContain(path.basename(outPath));
	});

	it("decodes base64-encoded SVG data URI before rendering", async () => {
		const dataUri = `data:image/svg+xml;base64,${Buffer.from(MINIMAL_SVG).toString("base64")}`;
		const overlay = makeOverlay({ svgData: dataUri });
		const outPath = await prepareShapeOverlay(overlay, tempDir);

		const files = await readdir(tempDir);
		expect(files).toContain(path.basename(outPath));
	});

	it("renders PNG at the overlay width and height when provided", async () => {
		const overlay = makeOverlay({ width: 320, height: 240 });
		const outPath = await prepareShapeOverlay(overlay, tempDir);

		const metadata = await sharp(outPath).metadata();
		expect(metadata.width).toBe(320);
		expect(metadata.height).toBe(240);
	});

	it("injects backgroundColor as CSS fill so the SVG shape element is filled", async () => {
		const circleSvg =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="white" stroke-width="6"/></svg>';
		const overlay = makeOverlay({
			svgData: circleSvg,
			backgroundColor: "#0000ff",
			width: 100,
			height: 100,
		});
		const outPath = await prepareShapeOverlay(overlay, tempDir);
		const { data, info } = await sharp(outPath).raw().toBuffer({ resolveWithObject: true });

		// Center pixel of the circle should be opaque blue (fill="none" overridden by CSS)
		const centerIdx =
			(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
		expect(data[centerIdx + 3]).toBeGreaterThan(200); // alpha: opaque
		expect(data[centerIdx + 2]).toBeGreaterThan(200); // blue channel dominant
	});
});

describe("buildShapeOverlayFilter", () => {
	it("returns a filter string with scale and overlay segments", () => {
		const overlay = makeOverlay({
			x: 10,
			y: 20,
			width: 300,
			height: 200,
			start: 1,
			end: 4,
		});
		const filter = buildShapeOverlayFilter(overlay, 2, "[0:v]", "v1");

		expect(filter).toContain("scale=w=300:h=200");
		expect(filter).toContain("overlay=");
		expect(filter).toContain("enable=");
		expect(filter).toContain("[v1]");
	});

	it("uses default size when width/height are absent", () => {
		const overlay = { ...makeOverlay(), width: undefined, height: undefined };
		const filter = buildShapeOverlayFilter(overlay, 1, "[0:v]", "v1");

		expect(filter).toContain("scale=w=100:h=100");
	});

	it("does not constrain aspect ratio so shapes can be stretched", () => {
		const overlay = makeOverlay({ width: 300, height: 200 });
		const filter = buildShapeOverlayFilter(overlay, 2, "[0:v]", "v1");

		expect(filter).not.toContain("force_original_aspect_ratio");
	});
});
