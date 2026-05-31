import { describe, expect, it, vi } from "vitest";
import type { VideoRenderPort } from "../../../../../shared/application/ports/outbound/VideoRenderPort.ts";
import type { VideoRenderInput } from "../VideoRenderUseCase.ts";
import { VideoRenderUseCase } from "../VideoRenderUseCase.ts";

function makeMockPort(): VideoRenderPort {
	return {
		render: vi.fn().mockResolvedValue({
			s3Key: "output/video.mp4",
			url: "https://example.com/video.mp4",
		}),
	};
}

function makeInput(overrides: Partial<VideoRenderInput> = {}): VideoRenderInput {
	return {
		sources: [{ url: "http://example.com/video.mp4", type: "video", duration: 5 }],
		trimEnd: 5,
		cuts: [],
		overlays: [],
		audioSources: [],
		audioMixMode: "mix",
		format: "mp4",
		...overrides,
	};
}

describe("VideoRenderUseCase", () => {
	it("returns s3Key, url and segments from the port", async () => {
		const port = makeMockPort();
		const useCase = new VideoRenderUseCase(port);

		const result = await useCase.execute(makeInput(), "output/video.mp4");

		expect(result).toEqual({
			s3Key: "output/video.mp4",
			url: "https://example.com/video.mp4",
			segments: [{ start: 0, end: 5 }],
		});
	});

	it("passes keepSegments derived from cuts to port.render", async () => {
		const port = makeMockPort();
		const useCase = new VideoRenderUseCase(port);
		const input = makeInput({ cuts: [{ start: 1, end: 3 }], trimEnd: 5 });

		const result = await useCase.execute(input, "output/video.mp4");

		const expectedSegments = [
			{ start: 0, end: 1 },
			{ start: 3, end: 5 },
		];
		expect(result.segments).toEqual(expectedSegments);
		expect(port.render).toHaveBeenCalledWith(
			expect.objectContaining({ keepSegments: expectedSegments }),
		);
	});

	it("forwards onProgress to port.render", async () => {
		const port = makeMockPort();
		const useCase = new VideoRenderUseCase(port);
		const onProgress = vi.fn().mockResolvedValue(undefined);

		await useCase.execute(makeInput(), "output/video.mp4", onProgress);

		expect(port.render).toHaveBeenCalledWith(expect.objectContaining({ onProgress }));
	});

	it("rejects when all content is cut away", async () => {
		const port = makeMockPort();
		const useCase = new VideoRenderUseCase(port);
		const input = makeInput({ cuts: [{ start: 0, end: 5 }], trimEnd: 5 });

		await expect(useCase.execute(input, "output/video.mp4")).rejects.toThrow(
			"No video content would remain",
		);
	});

	it("passes overlays and audioSources in RenderJob", async () => {
		const port = makeMockPort();
		const useCase = new VideoRenderUseCase(port);
		const input = makeInput({
			overlays: [
				{
					id: "o1",
					type: "text",
					text: "Hi",
					start: 0,
					end: 5,
					trackOrder: 0,
					x: 10,
					y: 20,
					canvasWidth: 1920,
					canvasHeight: 1080,
					textAlign: "left",
				},
			],
			audioSources: [
				{
					url: "http://example.com/audio.mp3",
					startTime: 0,
					duration: 5,
					volume: 1,
					muted: false,
					solo: false,
				},
			],
		});

		await useCase.execute(input, "output/video.mp4");

		expect(port.render).toHaveBeenCalledWith(
			expect.objectContaining({
				overlays: input.overlays,
				audioSources: input.audioSources,
			}),
		);
	});
});
