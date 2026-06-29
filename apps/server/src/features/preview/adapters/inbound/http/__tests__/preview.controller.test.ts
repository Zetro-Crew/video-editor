import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEnvConfig } from "../../../../../../config/env.ts";
import { signUrl } from "../../../../application/services/url-signing.ts";
import { InMemoryStorageAdapter } from "../../../../../../infrastructure/storage/__tests__/InMemoryStorageAdapter.ts";
import { previewController } from "../preview.controller.ts";

function makeConfig(): ApiEnvConfig {
	return {
		CORE_BASE_URL: "http://core.local/private",
		SERVER_BASE_URL: "http://server.local",
		MAX_PREVIEW_DURATION_MS: 60_000,
		PREVIEW_JOB_TTL_SECONDS: 86400,
		S3_PREVIEW_PREFIX: "preview",
		PREVIEW_SIGNING_SECRET: "test-secret-for-url-signing-32characters",
	} as unknown as ApiEnvConfig;
}

const SECRET = "test-secret-for-url-signing-32characters";

function makeSegmentQuery(targetUrl: string, token: string) {
	const encoded = Buffer.from(targetUrl).toString("base64url");
	const sig = signUrl(SECRET, targetUrl, token);
	return `/editor/segment?url=${encoded}&token=${encodeURIComponent(token)}&sig=${sig}`;
}

describe("previewController GET /editor/segment — ztube-token forwarding", () => {
	let app: ReturnType<typeof Fastify>;

	beforeEach(async () => {
		app = Fastify({ logger: false });
		await app.register(previewController, { storage: new InMemoryStorageAdapter(), config: makeConfig() });
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(async () => {
		await app.close();
		vi.unstubAllGlobals();
	});

	const targetUrl = "https://vod.example.com/seg.m4s";
	const vodToken = "vod-tok";

	it("forwards ztube-token header when cookie is present", async () => {
		const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
		fetchSpy.mockResolvedValueOnce(
			new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "video/mp4" } }),
		);

		const res = await app.inject({
			method: "GET",
			url: makeSegmentQuery(targetUrl, vodToken),
			headers: { cookie: "ztube-token=zt-abc123" },
		});

		expect(res.statusCode).toBe(200);
		const init = fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
		expect(init.headers["ztube-token"]).toBe("zt-abc123");
		expect(init.headers["vod-token"]).toBe(vodToken);
	});

	it("omits ztube-token header when cookie is absent", async () => {
		const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
		fetchSpy.mockResolvedValueOnce(
			new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "video/mp4" } }),
		);

		const res = await app.inject({
			method: "GET",
			url: makeSegmentQuery(targetUrl, vodToken),
		});

		expect(res.statusCode).toBe(200);
		const init = fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
		expect(init.headers["ztube-token"]).toBeUndefined();
		expect(init.headers["vod-token"]).toBe(vodToken);
	});

	it("URL-decodes ztube-token cookie value", async () => {
		const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
		fetchSpy.mockResolvedValueOnce(
			new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "video/mp4" } }),
		);

		await app.inject({
			method: "GET",
			url: makeSegmentQuery(targetUrl, vodToken),
			headers: { cookie: "other=x; ztube-token=ab%3Dcd; foo=1" },
		});

		const init = fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
		expect(init.headers["ztube-token"]).toBe("ab=cd");
	});

	it("returns 400 when ztube-token cookie has malformed percent encoding", async () => {
		const res = await app.inject({
			method: "GET",
			url: makeSegmentQuery(targetUrl, vodToken),
			headers: { cookie: "ztube-token=%ZZ" },
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.body)).toEqual({ error: "Invalid ztube-token cookie" });
	});
});

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

	describe("ztube-token cookie parsing", () => {
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

		const stubHappyFetch = () => {
			const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
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
			return fetchSpy;
		};

		const validBody = {
			source: {
				type: "channel-range",
				channelId: "ch-001",
				startTimeMs: 1000,
				endTimeMs: 16_000,
			},
		};

		it("forwards Cookie: ztube-token=<value> upstream when present", async () => {
			const fetchSpy = stubHappyFetch();
			const res = await app.inject({
				method: "POST",
				url: "/editor/preview-source",
				headers: { cookie: "ztube-token=abc" },
				payload: validBody,
			});
			expect(res.statusCode).toBe(200);
			const playCall = fetchSpy.mock.calls[0];
			const playInit = playCall[1] as { headers: Record<string, string> };
			expect(playInit.headers.Cookie).toBe("ztube-token=abc");
		});

		it("forwards no Cookie header when none present", async () => {
			const fetchSpy = stubHappyFetch();
			const res = await app.inject({
				method: "POST",
				url: "/editor/preview-source",
				payload: validBody,
			});
			expect(res.statusCode).toBe(200);
			const playInit = fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
			expect(playInit.headers.Cookie).toBeUndefined();
		});

		it("URL-decodes ztube-token cookie value mixed with other cookies", async () => {
			const fetchSpy = stubHappyFetch();
			const res = await app.inject({
				method: "POST",
				url: "/editor/preview-source",
				headers: { cookie: "foo=1; ztube-token=ab%3Dcd; bar=2" },
				payload: validBody,
			});
			expect(res.statusCode).toBe(200);
			const playInit = fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
			expect(playInit.headers.Cookie).toBe("ztube-token=ab=cd");
		});

		it("returns 400 when ztube-token cookie has malformed percent encoding", async () => {
			const res = await app.inject({
				method: "POST",
				url: "/editor/preview-source",
				headers: { cookie: "ztube-token=%ZZ" },
				payload: validBody,
			});
			expect(res.statusCode).toBe(400);
			expect(JSON.parse(res.body)).toEqual({ error: "Invalid ztube-token cookie" });
		});
	});
});
