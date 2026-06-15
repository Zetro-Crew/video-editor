import { dispatch } from "@designcombo/events";
import type StateManager from "@designcombo/state";
import { ADD_IMAGE, ADD_VIDEO } from "@designcombo/state";
import type { ITrackItem } from "@designcombo/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@designcombo/events", () => ({ dispatch: vi.fn() }));
vi.mock("@designcombo/timeline", () => ({ generateId: () => "generated-id" }));
vi.mock("../preview-source-api", () => ({
	resolvePreviewSource: vi.fn(),
}));

import {
	addPreviewItemToEditor,
	addStoredMediaToEditor,
	buildExternalMetadata,
	buildFallbackTrackItem,
	CoreUnavailableError,
	getDurationFromItem,
	StoredMediaNotFoundError,
} from "../payload-intake";
import { resolvePreviewSource } from "../preview-source-api";

const dispatchMock = dispatch as unknown as ReturnType<typeof vi.fn>;

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
	it("maps recording-range payload to externalKind=recording-range metadata", () => {
		const result = buildExternalMetadata({
			kind: "recording-range",
			channelId: "ch-1",
			startTimeMs: 1000,
			endTimeMs: 4000,
			durationMs: 3000,
		});
		expect(result).toEqual({
			externalKind: "recording-range",
			channelId: "ch-1",
			sourceStartTimeMs: 1000,
			sourceEndTimeMs: 4000,
		});
	});

	it("maps audio-range payload to externalKind=audio-range metadata", () => {
		const result = buildExternalMetadata({
			kind: "audio-range",
			audioId: "a-1",
			durationMs: 2000,
			playback: { kind: "audio", src: "https://example.com/track.mp3" },
			startTimeMs: 500,
			endTimeMs: 2500,
		});
		expect(result).toEqual({
			externalKind: "audio-range",
			audioId: "a-1",
			sourceStartTimeMs: 500,
			sourceEndTimeMs: 2500,
		});
	});
});

describe("buildFallbackTrackItem", () => {
	const metadata = {
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
		dispatchMock.mockReset();
	});

	afterEach(() => {
		resolveSpy.mockReset();
		dispatchMock.mockReset();
	});

	it("calls resolvePreviewSource with {type: 'channel-range', channelId, startTimeMs, endTimeMs} when playback.src absent", async () => {
		resolveSpy.mockResolvedValueOnce({
			type: "hls",
			playlistUrl: "https://example.com/preview.m3u8",
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
		expect(resolveSpy.mock.calls[0][0]).toEqual({
			type: "channel-range",
			channelId: "ch-7",
			startTimeMs: 1000,
			endTimeMs: 4000,
		});
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

describe("addStoredMediaToEditor", () => {
	const resolveSpy = resolvePreviewSource as unknown as ReturnType<typeof vi.fn>;
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		dispatchMock.mockReset();
		resolveSpy.mockReset();
		fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const watchResponse = (type: string, name = "demo") =>
		new Response(JSON.stringify({ type, name }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});

	const headOk = () => new Response("", { status: 200 });

	it("dispatches ADD_IMAGE for Image type with /storage/{id}/image src + default 5000ms", async () => {
		fetchSpy.mockResolvedValueOnce(watchResponse("Image", "logo"));
		fetchSpy.mockResolvedValueOnce(headOk());
		const sm = makeStateManager();
		const itemId = await addStoredMediaToEditor(sm, "img-001");

		expect(itemId).toBe("generated-id");
		expect(dispatchMock).toHaveBeenCalledTimes(1);
		const [evtType, evtArg] = dispatchMock.mock.calls[0];
		expect(evtType).toBe(ADD_IMAGE);
		expect(evtArg.payload.type).toBe("image");
		expect(evtArg.payload.name).toBe("logo");
		expect(evtArg.payload.details.src).toMatch(/\/storage\/img-001\/image$/);
		expect(evtArg.payload.display).toEqual({ from: 0, to: 5000 });
		expect(evtArg.payload.metadata.externalKind).toBe("stored-media");
		expect(evtArg.payload.metadata.storedMediaType).toBe("Image");
		expect(evtArg.payload.metadata.mediaId).toBe("img-001");
		expect(evtArg.payload.metadata.displayName).toBe("logo");
	});

	it("dispatches ADD_IMAGE for ScreenShotFromLive type", async () => {
		fetchSpy.mockResolvedValueOnce(watchResponse("ScreenShotFromLive", "snap"));
		fetchSpy.mockResolvedValueOnce(headOk());
		const sm = makeStateManager();
		await addStoredMediaToEditor(sm, "shot-1");
		const [evtType, evtArg] = dispatchMock.mock.calls[0];
		expect(evtType).toBe(ADD_IMAGE);
		expect(evtArg.payload.metadata.storedMediaType).toBe("ScreenShotFromLive");
	});

	it("throws StoredMediaNotFoundError when image HEAD returns 404 (no dispatch)", async () => {
		fetchSpy.mockResolvedValueOnce(watchResponse("Image"));
		fetchSpy.mockResolvedValueOnce(new Response("", { status: 404 }));
		const sm = makeStateManager();
		await expect(addStoredMediaToEditor(sm, "img-missing")).rejects.toBeInstanceOf(
			StoredMediaNotFoundError,
		);
		expect(dispatchMock).not.toHaveBeenCalled();
	});

	it("throws CoreUnavailableError when image HEAD returns 500 (no dispatch)", async () => {
		fetchSpy.mockResolvedValueOnce(watchResponse("Image"));
		fetchSpy.mockResolvedValueOnce(new Response("", { status: 500 }));
		const sm = makeStateManager();
		await expect(addStoredMediaToEditor(sm, "img-x")).rejects.toBeInstanceOf(CoreUnavailableError);
		expect(dispatchMock).not.toHaveBeenCalled();
	});

	it("dispatches ADD_VIDEO for ClipVideo type via resolvePreviewSource({type: 'media-id'})", async () => {
		fetchSpy.mockResolvedValueOnce(watchResponse("ClipVideo", "clip"));
		resolveSpy.mockResolvedValueOnce({
			type: "hls",
			playlistUrl: "https://example.com/clip.m3u8",
			durationMs: 60_000,
			sourceOffsetMs: 0,
			width: 1280,
			height: 1024,
			mediaCreatedAtMs: 1_700_000_000_000,
		});
		const sm = makeStateManager();
		await addStoredMediaToEditor(sm, "clip-001");

		expect(resolveSpy).toHaveBeenCalledTimes(1);
		expect(resolveSpy.mock.calls[0][0]).toEqual({ type: "media-id", mediaId: "clip-001" });

		const [evtType, evtArg] = dispatchMock.mock.calls[0];
		expect(evtType).toBe(ADD_VIDEO);
		expect(evtArg.payload.type).toBe("video");
		expect(evtArg.payload.details.src).toBe("https://example.com/clip.m3u8");
		expect(evtArg.payload.details.width).toBe(1280);
		expect(evtArg.payload.details.height).toBe(1024);
		expect(evtArg.payload.display).toEqual({ from: 0, to: 60_000 });
		expect(evtArg.payload.trim).toEqual({ from: 0, to: 60_000 });
		expect(evtArg.payload.metadata.storedMediaType).toBe("ClipVideo");
		expect(evtArg.payload.metadata.mediaId).toBe("clip-001");
	});

	it("dispatches ADD_VIDEO for UploadedVideo type", async () => {
		fetchSpy.mockResolvedValueOnce(watchResponse("UploadedVideo", "uploaded"));
		resolveSpy.mockResolvedValueOnce({
			type: "hls",
			playlistUrl: "https://example.com/up.m3u8",
			durationMs: 30_000,
			sourceOffsetMs: 0,
			width: 640,
			height: 480,
		});
		const sm = makeStateManager();
		await addStoredMediaToEditor(sm, "up-1");
		const [evtType, evtArg] = dispatchMock.mock.calls[0];
		expect(evtType).toBe(ADD_VIDEO);
		expect(evtArg.payload.metadata.storedMediaType).toBe("UploadedVideo");
	});

	it("throws StoredMediaNotFoundError on 404", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("", { status: 404 }));
		const sm = makeStateManager();
		await expect(addStoredMediaToEditor(sm, "bogus")).rejects.toBeInstanceOf(
			StoredMediaNotFoundError,
		);
		expect(dispatchMock).not.toHaveBeenCalled();
	});

	it("throws CoreUnavailableError on 500", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("", { status: 500 }));
		const sm = makeStateManager();
		await expect(addStoredMediaToEditor(sm, "x")).rejects.toBeInstanceOf(CoreUnavailableError);
	});

	it("throws CoreUnavailableError on network failure", async () => {
		fetchSpy.mockRejectedValueOnce(new Error("network down"));
		const sm = makeStateManager();
		await expect(addStoredMediaToEditor(sm, "x")).rejects.toBeInstanceOf(CoreUnavailableError);
	});
});
