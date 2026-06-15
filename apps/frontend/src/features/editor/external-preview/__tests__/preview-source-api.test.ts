import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePreviewSource } from "../preview-source-api";

describe("resolvePreviewSource", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("POSTs JSON to /editor/preview-source with channel-range body and include credentials", async () => {
		const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					type: "hls",
					playlistUrl: "x",
					durationMs: 1000,
					sourceOffsetMs: 0,
					width: 1920,
					height: 1080,
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);

		await resolvePreviewSource({
			type: "channel-range",
			channelId: "ch",
			startTimeMs: 0,
			endTimeMs: 1000,
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/editor/preview-source");
		expect(init.method).toBe("POST");
		expect(init.headers).toEqual({ "Content-Type": "application/json" });
		expect((init as RequestInit & { credentials?: string }).credentials).toBe("include");
		expect(JSON.parse(init.body as string)).toEqual({
			source: { type: "channel-range", channelId: "ch", startTimeMs: 0, endTimeMs: 1000 },
		});
	});

	it("POSTs JSON to /editor/preview-source with media-id body", async () => {
		const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					type: "hls",
					playlistUrl: "x",
					durationMs: 60000,
					sourceOffsetMs: 0,
					width: 1280,
					height: 1024,
					mediaCreatedAtMs: 1_700_000_000_000,
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);

		const result = await resolvePreviewSource({ type: "media-id", mediaId: "clip-001" });

		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(init.body as string)).toEqual({
			source: { type: "media-id", mediaId: "clip-001" },
		});
		expect(result.durationMs).toBe(60000);
		expect(result.mediaCreatedAtMs).toBe(1_700_000_000_000);
	});

	it("throws when fetch returns non-ok response", async () => {
		const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
		fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 500 }));

		await expect(
			resolvePreviewSource({
				type: "channel-range",
				channelId: "ch",
				startTimeMs: 0,
				endTimeMs: 1000,
			}),
		).rejects.toThrow(/500/);
	});
});
