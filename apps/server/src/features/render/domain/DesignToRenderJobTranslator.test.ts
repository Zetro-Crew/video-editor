import { describe, expect, it } from "vitest";
import { designPayloadSchema } from "../adapters/inbound/http/design-payload.schema.ts";
import type { IDesign, ITrackItemBase } from "./DesignToRenderJobTranslator.ts";
import { translate } from "./DesignToRenderJobTranslator.ts";

function baseDesign(overrides: Partial<IDesign> = {}): IDesign {
	return {
		id: "d1",
		size: { width: 1920, height: 1080 },
		fps: 30,
		tracks: [],
		trackItemIds: [],
		trackItemsMap: {},
		...overrides,
	};
}

function videoItem(
	id: string,
	displayFrom: number,
	displayTo: number,
	src: string,
	extra: Partial<ITrackItemBase> = {},
): ITrackItemBase {
	return {
		id,
		type: "video",
		display: { from: displayFrom, to: displayTo },
		details: { src, width: 1920, height: 1080, left: 0, top: 0 },
		...extra,
	};
}

describe("DesignToRenderJobTranslator", () => {
	describe("sources", () => {
		it("produces one source for a single full-frame video item", () => {
			const design = baseDesign({
				tracks: [{ id: "t1", type: "main", items: ["v1"] }],
				trackItemsMap: {
					v1: videoItem("v1", 0, 5000, "http://example.com/video.mp4"),
				},
			});

			const result = translate(design, "mp4");

			expect(result.sources).toHaveLength(1);
			expect(result.sources[0]).toMatchObject({
				url: "http://example.com/video.mp4",
				type: "video",
				duration: 5,
			});
			expect(result.trimEnd).toBe(5);
			expect(result.cuts).toEqual([]);
			expect(result.format).toBe("mp4");
		});

		it("inserts blank source to fill gap between two video items", () => {
			const design = baseDesign({
				tracks: [{ id: "t1", type: "main", items: ["v1", "v2"] }],
				trackItemsMap: {
					v1: videoItem("v1", 0, 3000, "http://example.com/v1.mp4"),
					v2: videoItem("v2", 5000, 8000, "http://example.com/v2.mp4"),
				},
			});

			const { sources } = translate(design, "mp4");

			expect(sources).toHaveLength(3);
			expect(sources[0]).toMatchObject({
				url: "http://example.com/v1.mp4",
				duration: 3,
			});
			expect(sources[1]).toMatchObject({
				url: expect.stringContaining("internal://blank"),
				duration: 2,
			});
			expect(sources[2]).toMatchObject({
				url: "http://example.com/v2.mp4",
				duration: 3,
			});
		});

		it("applies trim range to source when item has trim", () => {
			const design = baseDesign({
				tracks: [{ id: "t1", type: "main", items: ["v1"] }],
				trackItemsMap: {
					v1: videoItem("v1", 0, 4000, "http://example.com/video.mp4", {
						trim: { from: 2000, to: 6000 },
					}),
				},
			});

			const { sources } = translate(design, "mp4");

			expect(sources[0]).toMatchObject({
				trimFrom: 2,
				trimTo: 6,
			});
		});
	});

	describe("audioSources", () => {
		it("maps audio track item to audioSources with normalised volume and trim", () => {
			const design = baseDesign({
				tracks: [
					{ id: "t1", type: "main", items: ["v1"] },
					{ id: "t2", type: "audio", items: ["a1"] },
				],
				trackItemsMap: {
					v1: videoItem("v1", 0, 5000, "http://example.com/video.mp4"),
					a1: {
						id: "a1",
						type: "audio",
						display: { from: 0, to: 4000 },
						trim: { from: 1000, to: 5000 },
						duration: 10000,
						details: { src: "http://example.com/audio.mp3", volume: 50 },
					},
				},
			});

			const { audioSources } = translate(design, "mp4");

			expect(audioSources).toHaveLength(1);
			expect(audioSources[0]).toMatchObject({
				url: "http://example.com/audio.mp3",
				startTime: 0,
				duration: 4,
				originalDuration: 10,
				audioTrimStart: 1,
				audioTrimEnd: 5,
				volume: 0.5,
				muted: false,
			});
		});

		it("marks audio sources from muted tracks as muted", () => {
			const design = baseDesign({
				tracks: [
					{ id: "t1", type: "main", items: ["v1"] },
					{ id: "t2", type: "audio", items: ["a1"], muted: true },
				],
				trackItemsMap: {
					v1: videoItem("v1", 0, 5000, "http://example.com/video.mp4"),
					a1: {
						id: "a1",
						type: "audio",
						display: { from: 0, to: 4000 },
						details: { src: "http://example.com/audio.mp3", volume: 100 },
					},
				},
			});

			const { audioSources } = translate(design, "mp4");

			expect(audioSources).toHaveLength(1);
			expect(audioSources[0]).toMatchObject({ muted: true });
		});

		it("sets audioMixMode to replace when audio tracks are present", () => {
			const design = baseDesign({
				tracks: [
					{ id: "t1", type: "main", items: ["v1"] },
					{ id: "t2", type: "audio", items: ["a1"] },
				],
				trackItemsMap: {
					v1: videoItem("v1", 0, 5000, "http://example.com/video.mp4"),
					a1: {
						id: "a1",
						type: "audio",
						display: { from: 0, to: 4000 },
						details: { src: "http://example.com/audio.mp3", volume: 100 },
					},
				},
			});

			expect(translate(design, "mp4").audioMixMode).toBe("replace");
		});

		it("sets audioMixMode to mix when no audio tracks", () => {
			const design = baseDesign({
				tracks: [{ id: "t1", type: "main", items: ["v1"] }],
				trackItemsMap: {
					v1: videoItem("v1", 0, 5000, "http://example.com/video.mp4"),
				},
			});

			expect(translate(design, "mp4").audioMixMode).toBe("mix");
		});
	});

	describe("overlays", () => {
		it("converts a text item to a TextOverlay with position, font size and color", () => {
			const design = baseDesign({
				tracks: [{ id: "t1", type: "main", items: ["v1", "txt1"] }],
				trackItemsMap: {
					v1: videoItem("v1", 0, 5000, "http://example.com/video.mp4"),
					txt1: {
						id: "txt1",
						type: "text",
						display: { from: 0, to: 5000 },
						details: {
							text: "Hello",
							left: 100,
							top: 200,
							width: 400,
							height: 80,
							fontSize: 32,
							color: "#ffffff",
						},
					},
				},
			});

			const { overlays } = translate(design, "mp4");

			expect(overlays).toHaveLength(1);
			expect(overlays[0]).toMatchObject({
				id: "txt1",
				type: "text",
				text: "Hello",
				start: 0,
				end: 5,
				fontSize: 32,
				fontColor: "#ffffff",
				canvasWidth: 1920,
				canvasHeight: 1080,
			});
		});

		it("converts a shape item to a ShapeOverlay with svgData, position, and timing", () => {
			const svgContent =
				'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>';
			const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString("base64")}`;

			const design = baseDesign({
				tracks: [{ id: "t1", type: "main", items: ["v1", "s1"] }],
				trackItemsMap: {
					v1: videoItem("v1", 0, 5000, "http://example.com/video.mp4"),
					s1: {
						id: "s1",
						type: "shape",
						display: { from: 1000, to: 4000 },
						details: {
							src: svgDataUri,
							left: 192,
							top: 108,
							width: 300,
							height: 200,
							opacity: 80,
						},
					},
				},
			});

			const { overlays } = translate(design, "mp4");

			expect(overlays).toHaveLength(1);
			expect(overlays[0]).toMatchObject({
				id: "s1",
				type: "shape",
				svgData: svgDataUri,
				start: 1,
				end: 4,
				x: 10,
				y: 10,
				width: 300,
				height: 200,
				opacity: 0.8,
			});
		});

		it("applies CSS scale transform to shape width and height", () => {
			const svgContent =
				'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80"/></svg>';
			const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString("base64")}`;

			const design = baseDesign({
				tracks: [{ id: "t1", type: "main", items: ["v1", "s1"] }],
				trackItemsMap: {
					v1: videoItem("v1", 0, 5000, "http://example.com/video.mp4"),
					s1: {
						id: "s1",
						type: "shape",
						display: { from: 0, to: 5000 },
						details: {
							src: svgDataUri,
							left: 800,
							top: 400,
							width: 80,
							height: 80,
							transform: "scale(3, 2)",
						},
					},
				},
			});

			const { overlays } = translate(design, "mp4");

			expect(overlays).toHaveLength(1);
			expect(overlays[0]).toMatchObject({
				type: "shape",
				width: 240,
				height: 160,
			});
		});

		it("adjusts shape position for CSS transform-origin center when scale transform applied", () => {
			const svgContent =
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/></svg>';
			const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString("base64")}`;

			const design = baseDesign({
				tracks: [{ id: "t1", type: "main", items: ["v1", "s1"] }],
				trackItemsMap: {
					v1: videoItem("v1", 0, 5000, "http://example.com/video.mp4"),
					s1: {
						id: "s1",
						type: "shape",
						display: { from: 0, to: 5000 },
						details: {
							src: svgDataUri,
							left: 920,
							top: 500,
							width: 80,
							height: 80,
							transform: "scale(13.5)",
						},
					},
				},
			});

			const { overlays } = translate(design, "mp4");

			expect(overlays).toHaveLength(1);
			const shape = overlays[0];
			// visual_left = 920 - (1080 - 80) / 2 = 420 → 420/1920*100 = 21.875
			// visual_top  = 500 - (1080 - 80) / 2 = 0   → 0/1080*100 = 0
			expect(shape).toMatchObject({
				width: 1080,
				height: 1080,
				x: expect.closeTo(21.875, 2),
				y: expect.closeTo(0, 2),
			});
		});

		it("skips a shape item with no src", () => {
			const design = baseDesign({
				tracks: [{ id: "t1", type: "main", items: ["v1", "s1"] }],
				trackItemsMap: {
					v1: videoItem("v1", 0, 5000, "http://example.com/video.mp4"),
					s1: {
						id: "s1",
						type: "shape",
						display: { from: 0, to: 5000 },
						details: { left: 0, top: 0, width: 100, height: 100 },
					},
				},
			});

			const { overlays } = translate(design, "mp4");

			expect(overlays).toHaveLength(0);
		});
	});

	describe("format passthrough", () => {
		it("passes the requested format to the output", () => {
			const design = baseDesign({
				tracks: [{ id: "t1", type: "main", items: ["v1"] }],
				trackItemsMap: {
					v1: videoItem("v1", 0, 3000, "http://example.com/video.mp4"),
				},
			});

			expect(translate(design, "webp").format).toBe("webp");
			expect(translate(design, "dash").format).toBe("dash");
		});

		it("includes frameTimeMs in output when provided", () => {
			const design = baseDesign({
				tracks: [{ id: "t1", type: "main", items: ["v1"] }],
				trackItemsMap: {
					v1: videoItem("v1", 0, 3000, "http://example.com/video.mp4"),
				},
			});

			expect(translate(design, "webp", 1500).frameTimeMs).toBe(1500);
		});
	});
});

describe("normalizeVolume (via translate)", () => {
	it("volume 50 on audio track → 0.5 in output", () => {
		const design = baseDesign({
			tracks: [
				{ id: "t1", type: "main", items: ["v1"] },
				{ id: "t2", type: "audio", items: ["a1"] },
			],
			trackItemsMap: {
				v1: videoItem("v1", 0, 5000, "http://example.com/video.mp4"),
				a1: {
					id: "a1",
					type: "audio",
					display: { from: 0, to: 5000 },
					details: { src: "http://example.com/audio.mp3", volume: 50 },
				},
			},
		});

		expect(translate(design, "mp4").audioSources[0]?.volume).toBe(0.5);
	});

	it("volume 100 on audio track → 1.0 in output", () => {
		const design = baseDesign({
			tracks: [
				{ id: "t1", type: "main", items: ["v1"] },
				{ id: "t2", type: "audio", items: ["a1"] },
			],
			trackItemsMap: {
				v1: videoItem("v1", 0, 5000, "http://example.com/video.mp4"),
				a1: {
					id: "a1",
					type: "audio",
					display: { from: 0, to: 5000 },
					details: { src: "http://example.com/audio.mp3", volume: 100 },
				},
			},
		});

		expect(translate(design, "mp4").audioSources[0]?.volume).toBe(1);
	});
});

describe("designPayloadSchema", () => {
	function rawDesign(overrides: Record<string, unknown> = {}): unknown {
		return {
			id: "d1",
			size: { width: 1920, height: 1080 },
			fps: 30,
			tracks: [],
			trackItemIds: [],
			trackItemsMap: {},
			...overrides,
		};
	}

	it("rejects volume > 100 on audio track item", () => {
		const design = rawDesign({
			tracks: [
				{ id: "t1", type: "main", items: ["v1"] },
				{ id: "t2", type: "audio", items: ["a1"] },
			],
			trackItemsMap: {
				v1: {
					id: "v1",
					type: "video",
					display: { from: 0, to: 5000 },
					details: { src: "http://example.com/v.mp4" },
				},
				a1: {
					id: "a1",
					type: "audio",
					display: { from: 0, to: 5000 },
					details: { src: "http://example.com/a.mp3", volume: 150 },
				},
			},
		});

		expect(designPayloadSchema.safeParse(design).success).toBe(false);
	});

	it("rejects volume > 100 on video track item", () => {
		const design = rawDesign({
			tracks: [{ id: "t1", type: "main", items: ["v1"] }],
			trackItemsMap: {
				v1: {
					id: "v1",
					type: "video",
					display: { from: 0, to: 5000 },
					details: { src: "http://example.com/v.mp4", volume: 200 },
				},
			},
		});

		expect(designPayloadSchema.safeParse(design).success).toBe(false);
	});

	it("coerces string px values to numbers in details", () => {
		const design = rawDesign({
			tracks: [{ id: "t1", type: "main", items: ["v1"] }],
			trackItemsMap: {
				v1: {
					id: "v1",
					type: "video",
					display: { from: 0, to: 5000 },
					details: { src: "http://example.com/v.mp4", left: "100", top: "50" },
				},
			},
		});

		const result = designPayloadSchema.safeParse(design);
		expect(result.success).toBe(true);
	});

	it("accepts valid design payload", () => {
		expect(designPayloadSchema.safeParse(rawDesign()).success).toBe(true);
	});

	it("rejects missing required size field", () => {
		const design = rawDesign({ size: undefined });
		expect(designPayloadSchema.safeParse(design).success).toBe(false);
	});
});
