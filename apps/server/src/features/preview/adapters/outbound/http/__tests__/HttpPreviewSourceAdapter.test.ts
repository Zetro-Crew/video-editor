import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpPreviewSourceAdapter } from "../HttpPreviewSourceAdapter.ts";

type FetchSpy = ReturnType<typeof vi.fn>;

const CORE = "https://core.example.com/private";
const SERVER = "https://server.example.com";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function textResponse(body: string, status = 200): Response {
	return new Response(body, { status });
}

describe("HttpPreviewSourceAdapter.play", () => {
	let fetchSpy: FetchSpy;
	beforeEach(() => {
		fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("hits {coreBaseUrl}/channels/:id/play?start&end and maps response", async () => {
		fetchSpy.mockResolvedValueOnce(
			jsonResponse({
				url: "/api/vod/generate?session=xyz",
				timeRanges: [[1000, 2000]],
				token: "tok-123",
			}),
		);
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
		});
		const out = await adapter.play("ch-001", 1000, 2000);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy.mock.calls[0][0]).toBe(
			"https://core.example.com/private/channels/ch-001/play?start=1000&end=2000",
		);
		expect(out).toEqual({
			mpdUrl: "https://server.example.com/api/vod/generate?session=xyz",
			token: "tok-123",
			segmentStartTimeMs: 1000,
		});
	});

	it("returns absolute play.url as-is (dev mock case)", async () => {
		fetchSpy.mockResolvedValueOnce(
			jsonResponse({
				url: "http://localhost:5050/vod/demo-recording/manifest.mpd",
				timeRanges: [[5_000, 6_000]],
				token: "t",
			}),
		);
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: "http://localhost:8002/private",
			serverBaseUrl: "http://localhost:4001",
		});
		const out = await adapter.play("ch", 5_000, 6_000);
		expect(out.mpdUrl).toBe("http://localhost:5050/vod/demo-recording/manifest.mpd");
	});

	it("sends Cookie header when authCookie set", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ url: "/x", timeRanges: [[0, 1]], token: "t" }));
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
			authCookie: "abc",
		});
		await adapter.play("ch", 0, 1);
		const callOpts = fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
		expect(callOpts.headers).toEqual({ Cookie: "ztube-token=abc" });
	});

	it("omits Cookie header when authCookie empty (no empty-value cookie)", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ url: "/x", timeRanges: [[0, 1]], token: "t" }));
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
		});
		await adapter.play("ch", 0, 1);
		const callOpts = fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
		expect(callOpts.headers).toEqual({});
	});

	it("throws RangeError on 404 (range not found)", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({}, 404));
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
		});
		await expect(adapter.play("ch", 0, 1)).rejects.toBeInstanceOf(RangeError);
	});

	it("throws on malformed inner timeRanges entry (empty inner array)", async () => {
		fetchSpy.mockResolvedValueOnce(
			jsonResponse({ url: "/x", timeRanges: [[]], token: "t" } as unknown),
		);
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
		});
		await expect(adapter.play("ch", 0, 1)).rejects.toThrow(/malformed timeRanges/i);
	});

	it("throws on timeRanges.length !== 1", async () => {
		fetchSpy.mockResolvedValueOnce(
			jsonResponse({
				url: "/x",
				timeRanges: [
					[0, 1],
					[2, 3],
				],
				token: "t",
			}),
		);
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
		});
		await expect(adapter.play("ch", 0, 3)).rejects.toThrow(/multi-range/);
	});

	it("throws on non-2xx", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({}, 500));
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
		});
		await expect(adapter.play("ch", 0, 1)).rejects.toThrow(/500/);
	});

	it("throws when token missing", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ url: "/x", timeRanges: [[0, 1]], token: "" }));
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
		});
		await expect(adapter.play("ch", 0, 1)).rejects.toThrow(/no token/);
	});
});

describe("HttpPreviewSourceAdapter.playMedia", () => {
	let fetchSpy: FetchSpy;
	beforeEach(() => {
		fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("hits {coreBaseUrl}/videos/:id/play and maps timeRanges to mediaCreatedAtMs + durationMs", async () => {
		const createdAt = 1_700_000_000_000;
		const durationMs = 60_000;
		fetchSpy.mockResolvedValueOnce(
			jsonResponse({
				url: "http://core/storage/clip-001/mpd",
				timeRanges: [[createdAt, createdAt + durationMs]],
			}),
		);
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
		});
		const out = await adapter.playMedia("clip-001");

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy.mock.calls[0][0]).toBe("https://core.example.com/private/videos/clip-001/play");
		expect(out).toEqual({
			mpdUrl: "http://core/storage/clip-001/mpd",
			mediaCreatedAtMs: createdAt,
			durationMs,
		});
	});

	it("sends Cookie header (ztube-token) and no vod-token on /videos/:id/play", async () => {
		fetchSpy.mockResolvedValueOnce(
			jsonResponse({
				url: "/storage/clip-001/mpd",
				timeRanges: [[1, 2]],
			}),
		);
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
			authCookie: "abc",
		});
		await adapter.playMedia("clip-001");
		const callOpts = fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
		expect(callOpts.headers).toEqual({ Cookie: "ztube-token=abc" });
		expect(callOpts.headers["vod-token"]).toBeUndefined();
	});

	it("throws RangeError on 404 (unknown media)", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({}, 404));
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
		});
		await expect(adapter.playMedia("bogus")).rejects.toBeInstanceOf(RangeError);
	});

	it("throws on non-2xx", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({}, 500));
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
		});
		await expect(adapter.playMedia("x")).rejects.toThrow(/500/);
	});

	it("throws on multi-range response", async () => {
		fetchSpy.mockResolvedValueOnce(
			jsonResponse({
				url: "/x",
				timeRanges: [
					[0, 1],
					[2, 3],
				],
			}),
		);
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
		});
		await expect(adapter.playMedia("x")).rejects.toThrow(/multi-range/);
	});

	it("throws when endMs <= startMs in timeRanges", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ url: "/x", timeRanges: [[1000, 1000]] }));
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
		});
		await expect(adapter.playMedia("x")).rejects.toThrow(/timeRanges/);
	});
});

describe("HttpPreviewSourceAdapter.fetchManifest", () => {
	let fetchSpy: FetchSpy;
	beforeEach(() => {
		fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("GETs the mpdUrl with vod-token header and returns text", async () => {
		fetchSpy.mockResolvedValueOnce(textResponse("<MPD/>"));
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
		});
		const body = await adapter.fetchManifest("https://vod/x.mpd", "tok");
		expect(body).toBe("<MPD/>");
		expect(fetchSpy.mock.calls[0][0]).toBe("https://vod/x.mpd");
		const opts = fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
		expect(opts.headers).toEqual({ "vod-token": "tok" });
	});

	it("omits vod-token header when token is undefined (media-id source path)", async () => {
		fetchSpy.mockResolvedValueOnce(textResponse("<MPD/>"));
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
			authCookie: "abc",
		});
		await adapter.fetchManifest("https://core/storage/clip-001/mpd");
		const opts = fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
		expect(opts.headers).toEqual({ Cookie: "ztube-token=abc" });
		expect(opts.headers["vod-token"]).toBeUndefined();
	});

	it("forwards Core ztube-token cookie to VOD origin (shared auth boundary in prod)", async () => {
		fetchSpy.mockResolvedValueOnce(textResponse("<MPD/>"));
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
			authCookie: "abc",
		});
		await adapter.fetchManifest("https://vod/x.mpd", "tok");
		const opts = fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
		expect(opts.headers).toEqual({ "vod-token": "tok", Cookie: "ztube-token=abc" });
	});

	it("throws on non-2xx", async () => {
		fetchSpy.mockResolvedValueOnce(textResponse("nope", 401));
		const adapter = new HttpPreviewSourceAdapter({
			coreBaseUrl: CORE,
			serverBaseUrl: SERVER,
		});
		await expect(adapter.fetchManifest("https://vod/x.mpd", "tok")).rejects.toThrow(/401/);
	});
});
