import { describe, expect, it } from "vitest";
import type { ApiEnvConfig } from "../../../../../config/env.ts";
import { InMemoryStorageAdapter } from "../../../../../infrastructure/storage/__tests__/InMemoryStorageAdapter.ts";
import type {
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
		MAX_PREVIEW_DURATION_MS: 3_600_000,
		PREVIEW_JOB_TTL_SECONDS: 86400,
		S3_PREVIEW_PREFIX: "preview",
		PREVIEW_SIGNING_SECRET: "test-secret-for-url-signing-32characters",
	} as unknown as ApiEnvConfig;
}

function makePreviewSource(): PreviewSourcePort & {
	playCalls: Array<{ channelId: string; start: number; end: number }>;
	fetchCalls: Array<{ mpdUrl: string; token: string }>;
} {
	const playCalls: Array<{ channelId: string; start: number; end: number }> = [];
	const fetchCalls: Array<{ mpdUrl: string; token: string }> = [];
	return {
		playCalls,
		fetchCalls,
		async play(channelId, start, end): Promise<PreviewPlayResult> {
			playCalls.push({ channelId, start, end });
			return {
				mpdUrl: "http://mock-vod/vod/demo-recording/manifest.mpd",
				token: "vod-token-xyz",
				segmentStartTimeMs: SEG_START,
			};
		},
		async fetchManifest(mpdUrl, token) {
			fetchCalls.push({ mpdUrl, token });
			return FIXTURE_MPD;
		},
	};
}

describe("GeneratePreviewUseCase", () => {
	it("orchestrates play → fetchManifest → mpd-to-hls → proxy-rewrite → store", async () => {
		const storage = new InMemoryStorageAdapter();
		const previewSource = makePreviewSource();
		const uc = new GeneratePreviewUseCase(storage, makeConfig());

		const out = await uc.execute({
			channelId: "ch-001",
			startTimeMs: SEG_START,
			endTimeMs: SEG_START + 15_000,
			previewSource,
		});

		expect(previewSource.playCalls).toEqual([
			{ channelId: "ch-001", start: SEG_START, end: SEG_START + 15_000 },
		]);
		expect(previewSource.fetchCalls).toEqual([
			{ mpdUrl: "http://mock-vod/vod/demo-recording/manifest.mpd", token: "vod-token-xyz" },
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
		// Original segment URL base64url-encoded
		const expectedDecoded = "http://mock-vod/vod/demo-recording/media/segment_v4_2362.m4s";
		const expectedEncoded = Buffer.from(expectedDecoded, "utf8").toString("base64url");
		expect(playlist).toContain(expectedEncoded);
	});
});
