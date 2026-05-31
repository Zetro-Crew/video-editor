import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpPreviewSourceAdapter } from "../HttpPreviewSourceAdapter.ts";

type FetchSpy = ReturnType<typeof vi.fn>;

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
		const adapter = new HttpPreviewSourceAdapter("https://core.example.com/private");
		const out = await adapter.play("ch-001", 1000, 2000);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy.mock.calls[0][0]).toBe(
			"https://core.example.com/private/channels/ch-001/play?start=1000&end=2000",
		);
		expect(out).toEqual({
			mpdUrl: "https://core.example.com/api/vod/generate?session=xyz",
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
		const adapter = new HttpPreviewSourceAdapter("http://localhost:8002/private");
		const out = await adapter.play("ch", 5_000, 6_000);
		expect(out.mpdUrl).toBe("http://localhost:5050/vod/demo-recording/manifest.mpd");
	});

	it("sends Cookie header when authCookie set", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ url: "/x", timeRanges: [[0, 1]], token: "t" }));
		const adapter = new HttpPreviewSourceAdapter("https://core/private", "abc");
		await adapter.play("ch", 0, 1);
		expect(fetchSpy.mock.calls[0][1]).toEqual({ headers: { Cookie: "ztube-token=abc" } });
	});

	it("omits Cookie header when authCookie empty (no empty-value cookie)", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ url: "/x", timeRanges: [[0, 1]], token: "t" }));
		const adapter = new HttpPreviewSourceAdapter("https://core/private");
		await adapter.play("ch", 0, 1);
		const callOpts = fetchSpy.mock.calls[0][1] as { headers: Record<string, string> };
		expect(callOpts.headers).toEqual({});
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
		const adapter = new HttpPreviewSourceAdapter("https://core/private");
		await expect(adapter.play("ch", 0, 3)).rejects.toThrow(/multi-range/);
	});

	it("throws on non-2xx", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({}, 500));
		const adapter = new HttpPreviewSourceAdapter("https://core/private");
		await expect(adapter.play("ch", 0, 1)).rejects.toThrow(/500/);
	});

	it("throws when token missing", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ url: "/x", timeRanges: [[0, 1]], token: "" }));
		const adapter = new HttpPreviewSourceAdapter("https://core/private");
		await expect(adapter.play("ch", 0, 1)).rejects.toThrow(/no token/);
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
		const adapter = new HttpPreviewSourceAdapter("https://core/private");
		const body = await adapter.fetchManifest("https://vod/x.mpd", "tok");
		expect(body).toBe("<MPD/>");
		expect(fetchSpy.mock.calls[0][0]).toBe("https://vod/x.mpd");
		expect(fetchSpy.mock.calls[0][1]).toEqual({ headers: { "vod-token": "tok" } });
	});

	it("forwards Cookie when authCookie set", async () => {
		fetchSpy.mockResolvedValueOnce(textResponse("<MPD/>"));
		const adapter = new HttpPreviewSourceAdapter("https://core/private", "abc");
		await adapter.fetchManifest("https://vod/x.mpd", "tok");
		expect(fetchSpy.mock.calls[0][1]).toEqual({
			headers: { "vod-token": "tok", Cookie: "ztube-token=abc" },
		});
	});

	it("throws on non-2xx", async () => {
		fetchSpy.mockResolvedValueOnce(textResponse("nope", 401));
		const adapter = new HttpPreviewSourceAdapter("https://core/private");
		await expect(adapter.fetchManifest("https://vod/x.mpd", "tok")).rejects.toThrow(/401/);
	});
});
