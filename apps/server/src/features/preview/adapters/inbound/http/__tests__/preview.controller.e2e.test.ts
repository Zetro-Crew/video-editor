import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEnvConfig } from "../../../../../../config/env.ts";
import { silentLogger } from "../../../../../../infrastructure/fastify/__tests__/silent-logger.ts";
import {
	createFastifyInstance,
	type TypedFastify,
} from "../../../../../../infrastructure/fastify/fastify.ts";
import { InMemoryStorageAdapter } from "../../../../../../infrastructure/storage/__tests__/InMemoryStorageAdapter.ts";
import { previewController } from "../preview.controller.ts";

const CORE_BASE = "http://core.example/private";
const SERVER_BASE = "http://server.local";

// Single MPD segment fixture. startNumber=2362 + 15s duration → one segment.
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

const FIXTURE_WINDOW = { startMs: 1_778_412_270_000, endMs: 1_778_412_870_000 };
const RELATIVE_MPD_PATH = "/vod/demo-recording/manifest.mpd";
const SEGMENT_BYTES = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);

function buildPlayResponse(start: number): Response {
	return new Response(
		JSON.stringify({
			url: RELATIVE_MPD_PATH,
			timeRanges: [[start, FIXTURE_WINDOW.endMs]],
			token: "vod-token-xyz",
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

describe("preview.controller E2E (fetch-stubbed)", () => {
	let server: TypedFastify;
	let storage: InMemoryStorageAdapter;
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		storage = new InMemoryStorageAdapter();
		server = createFastifyInstance({ loggerInstance: silentLogger });
		const config = {
			CORE_BASE_URL: CORE_BASE,
			SERVER_BASE_URL: SERVER_BASE,
			SERVER_PUBLIC_PATH_PREFIX: "",
			MAX_PREVIEW_DURATION_MS: 60_000,
			PREVIEW_JOB_TTL_SECONDS: 86400,
			S3_PREVIEW_PREFIX: "preview",
			PREVIEW_SIGNING_SECRET: "test-secret-for-url-signing-32characters",
		} as unknown as ApiEnvConfig;
		await server.register(previewController, { storage, config });

		fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
	});

	afterEach(async () => {
		await server.close();
		vi.unstubAllGlobals();
	});

	it("end-to-end: preview-source → playlist in storage → segment proxy fetches upstream", async () => {
		const expectedMpdUrl = `${SERVER_BASE}${RELATIVE_MPD_PATH}`;
		fetchSpy.mockImplementation(async (input: string | URL | Request) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.startsWith(`${CORE_BASE}/channels/`)) {
				return buildPlayResponse(FIXTURE_WINDOW.startMs);
			}
			if (url === expectedMpdUrl) {
				return new Response(FIXTURE_MPD, { status: 200 });
			}
			// Segment fetch through the proxy: any other URL → bytes
			return new Response(SEGMENT_BYTES, {
				status: 200,
				headers: { "content-type": "video/mp4" },
			});
		});

		const res = await server.inject({
			method: "POST",
			url: "/editor/preview-source",
			payload: {
				source: {
					type: "channel-range",
					channelId: "ch-001",
					startTimeMs: FIXTURE_WINDOW.startMs,
					endTimeMs: FIXTURE_WINDOW.startMs + 15_000,
				},
			},
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body) as {
			type: string;
			playlistUrl: string;
			width: number;
			height: number;
		};
		expect(body.type).toBe("hls");
		expect(body.width).toBe(1280);
		expect(body.height).toBe(720);

		const key = body.playlistUrl.replace("internal://", "");
		const playlist = storage.readText(key);
		if (!playlist) throw new Error("playlist not stored");
		expect(playlist).toContain(`${SERVER_BASE}/editor/segment?url=`);

		const segmentLine = playlist
			.split("\n")
			.find((l) => l.startsWith(`${SERVER_BASE}/editor/segment?url=`));
		if (!segmentLine) throw new Error("segment line not found");

		const proxyPath = segmentLine.replace(SERVER_BASE, "");
		const segRes = await server.inject({ method: "GET", url: proxyPath });
		expect(segRes.statusCode).toBe(200);
		expect(segRes.rawPayload.length).toBe(SEGMENT_BYTES.length);
	});

	it("range outside fixture window → 400 (adapter throws RangeError on core 404)", async () => {
		fetchSpy.mockImplementation(async () => new Response(JSON.stringify({}), { status: 404 }));

		const res = await server.inject({
			method: "POST",
			url: "/editor/preview-source",
			payload: {
				source: {
					type: "channel-range",
					channelId: "ch-001",
					startTimeMs: FIXTURE_WINDOW.endMs + 1_000,
					endTimeMs: FIXTURE_WINDOW.endMs + 5_000,
				},
			},
		});
		expect(res.statusCode).toBe(400);
	});
});
