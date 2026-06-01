import type StateManager from "@designcombo/state";
import type { ITrackItem } from "@designcombo/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@designcombo/events", () => ({ dispatch: vi.fn() }));
vi.mock("@designcombo/timeline", () => ({ generateId: () => "generated-id" }));
vi.mock("../preview-source-api", () => ({
	resolvePreviewSource: vi.fn(),
}));

import {
	addPreviewItemToEditor,
	buildExternalMetadata,
	buildFallbackTrackItem,
	getDurationFromItem,
} from "../payload-intake";
import { resolvePreviewSource } from "../preview-source-api";

const makeStateManager = (): StateManager => {
	let state = {
		trackItemsMap: {} as Record<string, unknown>,
		duration: 0,
		tracks: [],
		trackItemIds: [] as string[],
		structure: [],
		activeIds: [],
	};
	return {
		getState: () => state,
		updateState: (patch: Record<string, unknown>) => {
			state = { ...state, ...patch };
		},
	} as unknown as StateManager;
};

describe("getDurationFromItem", () => {
	it("returns duration when larger than display range", () => {
		const item = {
			duration: 5000,
			display: { from: 0, to: 3000 },
		} as ITrackItem;
		expect(getDurationFromItem(item)).toBe(5000);
	});

	it("returns display range when larger than duration", () => {
		const item = {
			duration: 1000,
			display: { from: 0, to: 4000 },
		} as ITrackItem;
		expect(getDurationFromItem(item)).toBe(4000);
	});

	it("returns 0 for empty item", () => {
		expect(getDurationFromItem({} as ITrackItem)).toBe(0);
	});
});

describe("buildExternalMetadata", () => {
	it("maps recording-range payload to hls metadata", () => {
		const result = buildExternalMetadata({
			kind: "recording-range",
			channelId: "ch-1",
			startTimeMs: 1000,
			endTimeMs: 4000,
			durationMs: 3000,
		});
		expect(result).toEqual({
			sourceKind: "hls",
			externalKind: "recording-range",
			channelId: "ch-1",
			sourceStartTimeMs: 1000,
			sourceEndTimeMs: 4000,
		});
	});

	it("maps media payload with mp4 playback", () => {
		const result = buildExternalMetadata({
			kind: "media",
			mediaId: "m-1",
			playback: { kind: "mp4", src: "https://example.com/video.mp4" },
		});
		expect(result).toEqual({
			sourceKind: "mp4",
			externalKind: "media",
			mediaId: "m-1",
		});
	});

	it("maps audio-range payload", () => {
		const result = buildExternalMetadata({
			kind: "audio-range",
			audioId: "a-1",
			durationMs: 2000,
			playback: { kind: "audio", src: "https://example.com/track.mp3" },
			startTimeMs: 500,
			endTimeMs: 2500,
		});
		expect(result).toEqual({
			sourceKind: "audio",
			externalKind: "audio-range",
			audioId: "a-1",
			sourceStartTimeMs: 500,
			sourceEndTimeMs: 2500,
		});
	});
});

describe("buildFallbackTrackItem", () => {
	const metadata = {
		sourceKind: "hls" as const,
		externalKind: "recording-range" as const,
		channelId: "ch-1",
		sourceStartTimeMs: 1000,
		sourceEndTimeMs: 4000,
	};

	it("builds a video track item for recording-range", () => {
		const item = buildFallbackTrackItem(
			"item-1",
			0,
			{
				kind: "recording-range",
				channelId: "ch-1",
				startTimeMs: 1000,
				endTimeMs: 4000,
				durationMs: 3000,
			},
			metadata,
			"https://example.com/index.m3u8",
			500,
		);
		expect(item.id).toBe("item-1");
		expect(item.type).toBe("video");
		expect(item.display).toEqual({ from: 0, to: 3000 });
		expect(item.trim).toEqual({ from: 500, to: 3500 });
		expect(item.details.src).toBe("https://example.com/index.m3u8");
	});

	it("builds an audio track item for audio-range", () => {
		const audioMetadata = {
			sourceKind: "audio" as const,
			externalKind: "audio-range" as const,
			audioId: "a-1",
		};
		const item = buildFallbackTrackItem(
			"item-2",
			1000,
			{
				kind: "audio-range",
				audioId: "a-1",
				durationMs: 2000,
				playback: { kind: "audio", src: "https://example.com/track.mp3" },
			},
			audioMetadata,
			"https://example.com/track.mp3",
			0,
		);
		expect(item.id).toBe("item-2");
		expect(item.type).toBe("audio");
		expect(item.display).toEqual({ from: 1000, to: 3000 });
		expect(item.trim).toEqual({ from: 0, to: 2000 });
	});

	it("sets posterSrc as previewUrl for recording-range", () => {
		const item = buildFallbackTrackItem(
			"item-3",
			0,
			{
				kind: "recording-range",
				channelId: "ch-1",
				startTimeMs: 0,
				endTimeMs: 3000,
				durationMs: 3000,
				posterSrc: "https://example.com/poster.jpg",
			},
			metadata,
			"https://example.com/index.m3u8",
			0,
		);
		expect(item.metadata?.previewUrl).toBe("https://example.com/poster.jpg");
	});
});

describe("addPreviewItemToEditor recording-range integration", () => {
	const resolveSpy = resolvePreviewSource as unknown as ReturnType<typeof vi.fn>;

	beforeEach(() => {
		resolveSpy.mockReset();
	});

	afterEach(() => {
		resolveSpy.mockReset();
	});

	it("calls resolvePreviewSource with exactly (channelId, startTimeMs, endTimeMs) when playback.src absent", async () => {
		resolveSpy.mockResolvedValueOnce({
			type: "hls",
			playlistUrl: "https://example.com/preview.m3u8",
			channelId: "ch-7",
			requestedStartMs: 1000,
			requestedEndMs: 4000,
			durationMs: 3000,
			sourceOffsetMs: 500,
			width: 1280,
			height: 720,
		});

		const sm = makeStateManager();
		await addPreviewItemToEditor(sm, {
			kind: "recording-range",
			channelId: "ch-7",
			startTimeMs: 1000,
			endTimeMs: 4000,
			durationMs: 3000,
		});

		expect(resolveSpy).toHaveBeenCalledTimes(1);
		expect(resolveSpy.mock.calls[0]).toEqual(["ch-7", 1000, 4000]);
	});

	it("does not call resolvePreviewSource when payload.playback.src is present (fast path)", async () => {
		const sm = makeStateManager();
		await addPreviewItemToEditor(sm, {
			kind: "recording-range",
			channelId: "ch-7",
			startTimeMs: 1000,
			endTimeMs: 4000,
			durationMs: 3000,
			playback: { kind: "hls", src: "https://parent.example/preview.m3u8" },
		});

		expect(resolveSpy).not.toHaveBeenCalled();
	});
});
