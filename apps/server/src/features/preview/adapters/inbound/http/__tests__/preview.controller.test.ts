import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvConfig } from "../../../../../../config/env.ts";
import { InMemoryStorageAdapter } from "../../../../../../infrastructure/storage/__tests__/InMemoryStorageAdapter.ts";
import { previewController } from "../preview.controller.ts";

function makeConfig(): EnvConfig {
	return {
		CORE_BASE_URL: "http://core.local/private",
		SERVER_BASE_URL: "http://server.local",
		MAX_PREVIEW_DURATION_MS: 60_000,
		PREVIEW_JOB_TTL_SECONDS: 86400,
		S3_PREVIEW_PREFIX: "preview",
		PREVIEW_SIGNING_SECRET: "test-secret-for-url-signing-32characters",
	} as unknown as EnvConfig;
}

describe("previewController POST /editor/preview-source", () => {
	let app: ReturnType<typeof Fastify>;
	let storage: InMemoryStorageAdapter;

	beforeEach(async () => {
		app = Fastify({ logger: false });
		storage = new InMemoryStorageAdapter();
		await app.register(previewController, { storage, config: makeConfig() });
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(async () => {
		await app.close();
		vi.unstubAllGlobals();
	});

	it("400 when source.type wrong", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/editor/preview-source",
			payload: { source: { type: "other" } },
		});
		expect(res.statusCode).toBe(400);
	});

	it("400 when endTimeMs <= startTimeMs", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/editor/preview-source",
			payload: {
				source: { type: "channel-range", channelId: "ch", startTimeMs: 100, endTimeMs: 100 },
			},
		});
		expect(res.statusCode).toBe(400);
	});

	it("400 when duration > MAX_PREVIEW_DURATION_MS", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/editor/preview-source",
			payload: {
				source: {
					type: "channel-range",
					channelId: "ch",
					startTimeMs: 0,
					endTimeMs: 60_001,
				},
			},
		});
		expect(res.statusCode).toBe(400);
		expect(res.body).toContain("exceeds");
	});

	it("happy path: delegates to core via adapter and returns hls payload", async () => {
		const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
		const mpd = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
	<Period id="P0">
		<AdaptationSet contentType="video">
			<SegmentTemplate timescale="1000" duration="15000"
				media="segment_$RepresentationID$_$Number$.m4s"
				initialization="$RepresentationID$_init.mp4"
				startNumber="1"/>
			<Representation id="v4" mimeType="video/mp4" width="640" height="360" bandwidth="100000"/>
		</AdaptationSet>
	</Period>
</MPD>`;
		fetchSpy
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						url: "http://mock-vod/vod/demo/manifest.mpd",
						timeRanges: [[1000, 16_000]],
						token: "vod-tok",
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			)
			.mockResolvedValueOnce(new Response(mpd, { status: 200 }));

		const res = await app.inject({
			method: "POST",
			url: "/editor/preview-source",
			payload: {
				source: {
					type: "channel-range",
					channelId: "ch-001",
					startTimeMs: 1000,
					endTimeMs: 16_000,
				},
			},
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.type).toBe("hls");
		expect(body.width).toBe(640);
		expect(body.height).toBe(360);
		expect(body.playlistUrl).toMatch(/^internal:\/\/preview\//);
	});
});
