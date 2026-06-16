import { describe, expect, it } from "vitest";
import type { ApiEnvConfig } from "../../../../../config/env.ts";
import { silentLogger } from "../../../../../infrastructure/fastify/__tests__/silent-logger.ts";
import { InMemoryStorageAdapter } from "../../../../../infrastructure/storage/__tests__/InMemoryStorageAdapter.ts";
import type {
	FetchManifestContext,
	MediaPlayResult,
	PreviewPlayResult,
	PreviewSourcePort,
} from "../../ports/outbound/PreviewSourcePort.ts";
import { GeneratePreviewUseCase } from "../GeneratePreviewUseCase.ts";

const FIXTURE_MPD = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" profiles="urn:mpeg:dash:profile:full:2011">
	<Period id="P0">
		<AdaptationSet contentType="video">
			<SegmentTemplate timescale="1000" duration="15000"
				media="segment_$RepresentationID$_$Number$.m4s"
				initialization="$RepresentationID$_init.mp4"
				startNumber="2362"/>
			<Representation id="v4" mimeType="video/mp4" width="1280" height="720" bandwidth="100000"/>
		</AdaptationSet>
		<BaseURL>./</BaseURL>
	</Period>
	<BaseURL>media/</BaseURL>
</MPD>`;

const SEG_START = 1_778_412_270_000;

function makeConfig(): ApiEnvConfig {
	return {
		SERVER_BASE_URL: "http://server.local",
		SERVER_PUBLIC_PATH_PREFIX: "",
		MAX_PREVIEW_DURATION_MS: 3_600_000,
		PREVIEW_JOB_TTL_SECONDS: 86400,
		S3_PREVIEW_PREFIX: "preview",
		PREVIEW_SIGNING_SECRET: "test-secret-for-url-signing-32characters",
	} as unknown as ApiEnvConfig;
}

type SpyableSource = PreviewSourcePort & {
	playCalls: Array<{ channelId: string; start: number; end: number }>;
	playMediaCalls: string[];
	fetchCalls: Array<{
		mpdUrl: string;
		token: string | undefined;
		context: FetchManifestContext | undefined;
	}>;
};

function makePreviewSource(): SpyableSource {
	const playCalls: SpyableSource["playCalls"] = [];
	const playMediaCalls: string[] = [];
	const fetchCalls: SpyableSource["fetchCalls"] = [];
	return {
		playCalls,
		playMediaCalls,
		fetchCalls,
		async play(channelId, start, end): Promise<PreviewPlayResult> {
			playCalls.push({ channelId, start, end });
			return {
				mpdUrl: "http://mock-vod/vod/demo-recording/manifest.mpd",
				token: "vod-token-xyz",
				segmentStartTimeMs: SEG_START,
			};
		},
		async playMedia(mediaId): Promise<MediaPlayResult> {
			playMediaCalls.push(mediaId);
			return {
				mpdUrl: "http://core.example/private/storage/clip-001/mpd",
				mediaCreatedAtMs: SEG_START,
				durationMs: 15_000,
			};
		},
		async fetchManifest(mpdUrl, token, context) {
			fetchCalls.push({ mpdUrl, token, context });
			return FIXTURE_MPD;
		},
	};
}

describe("GeneratePreviewUseCase channel-range", () => {
	it("orchestrates play → fetchManifest → mpd-to-hls → proxy-rewrite → store", async () => {
		const storage = new InMemoryStorageAdapter();
		const previewSource = makePreviewSource();
		const uc = new GeneratePreviewUseCase(storage, makeConfig());

		const out = await uc.execute(
			{
				source: {
					type: "channel-range",
					channelId: "ch-001",
					startTimeMs: SEG_START,
					endTimeMs: SEG_START + 15_000,
				},
				previewSource,
			},
			{ logger: silentLogger },
		);

		expect(previewSource.playCalls).toEqual([
			{ channelId: "ch-001", start: SEG_START, end: SEG_START + 15_000 },
		]);
		expect(previewSource.fetchCalls).toEqual([
			{
				mpdUrl: "http://mock-vod/vod/demo-recording/manifest.mpd",
				token: "vod-token-xyz",
				context: { kind: "channel-range", channelId: "ch-001" },
			},
		]);

		expect(out.durationMs).toBe(15_000);
		expect(out.width).toBe(1280);
		expect(out.height).toBe(720);
		expect(out.playlistUrl).toMatch(/^internal:\/\/preview\//);

		const stored = Array.from(storage.objects.entries());
		expect(stored).toHaveLength(1);
		const playlist = stored[0][1].body.toString("utf8");
		expect(playlist).toContain("http://server.local/editor/segment?url=");
		expect(playlist).toContain("token=vod-token-xyz");
		expect(playlist).toContain("kind=channel-range");
		const expectedDecoded = "http://mock-vod/vod/demo-recording/media/segment_v4_2362.m4s";
		const expectedEncoded = Buffer.from(expectedDecoded, "utf8").toString("base64url");
		expect(playlist).toContain(expectedEncoded);
	});
});

describe("GeneratePreviewUseCase media-id", () => {
	it("orchestrates playMedia → fetchManifest (no token) → mpd-to-hls → proxy-rewrite (kind=media-id, no token) → store", async () => {
		const storage = new InMemoryStorageAdapter();
		const previewSource = makePreviewSource();
		const uc = new GeneratePreviewUseCase(storage, makeConfig());

		const out = await uc.execute(
			{
				source: { type: "media-id", mediaId: "clip-001" },
				previewSource,
			},
			{ logger: silentLogger },
		);

		expect(previewSource.playMediaCalls).toEqual(["clip-001"]);
		expect(previewSource.fetchCalls).toEqual([
			{
				mpdUrl: "http://core.example/private/storage/clip-001/mpd",
				token: undefined,
				context: { kind: "media-id", mediaId: "clip-001" },
			},
		]);

		expect(out.durationMs).toBe(15_000);
		expect(out.sourceOffsetMs).toBe(0);
		expect(out.mediaCreatedAtMs).toBe(SEG_START);
		expect(out.playlistUrl).toMatch(/^internal:\/\/preview\//);

		const stored = Array.from(storage.objects.entries());
		const playlist = stored[0][1].body.toString("utf8");
		expect(playlist).toContain("http://server.local/editor/segment?url=");
		expect(playlist).toContain("kind=media-id");
		expect(playlist).not.toContain("token=");
	});
});
