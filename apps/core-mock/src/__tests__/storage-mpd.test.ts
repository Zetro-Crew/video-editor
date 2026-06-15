import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCoreMock, type CoreMockHandle } from "../index.ts";

describe("core-mock GET /private/storage/:id/mpd + segments", () => {
	let handle: CoreMockHandle;

	beforeEach(async () => {
		handle = await buildCoreMock({ mockVodBaseUrl: "http://127.0.0.1:0" });
	});

	afterEach(async () => {
		await handle.app.close();
	});

	it("returns MPD XML with application/dash+xml content-type for ClipVideo", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/storage/demo-clip-001/mpd",
		});
		expect(res.statusCode).toBe(200);
		expect(res.headers["content-type"]).toBe("application/dash+xml");
		expect(res.rawPayload.byteLength).toBeGreaterThan(0);
		const xml = res.rawPayload.toString("utf8");
		expect(xml).toContain("<MPD");
		expect(xml).toContain("SegmentTemplate");
		expect(xml).toContain("init_v$RepresentationID$.mp4");
		expect(xml).toContain("segment_v$RepresentationID$_$Number$.m4s");
	}, 60_000);

	it("serves init_v0.mp4 segment bytes", async () => {
		// Warm fixture
		await handle.app.inject({ method: "GET", url: "/private/storage/demo-clip-001/mpd" });
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/storage/demo-clip-001/init_v0.mp4",
		});
		expect(res.statusCode).toBe(200);
		expect(res.headers["content-type"]).toBe("video/mp4");
		expect(res.rawPayload.byteLength).toBeGreaterThan(0);
	}, 60_000);

	it("serves segment_v0_N.m4s segment bytes for first segment number", async () => {
		const mpdRes = await handle.app.inject({
			method: "GET",
			url: "/private/storage/demo-clip-001/mpd",
		});
		const xml = mpdRes.rawPayload.toString("utf8");
		// Extract first segment number from SegmentTimeline (startNumber attr)
		const startNumberMatch = xml.match(/startNumber="(\d+)"/);
		const startNumber = startNumberMatch ? Number(startNumberMatch[1]) : 1;
		const res = await handle.app.inject({
			method: "GET",
			url: `/private/storage/demo-clip-001/segment_v0_${startNumber}.m4s`,
		});
		expect(res.statusCode).toBe(200);
		expect(res.headers["content-type"]).toBe("video/iso.segment");
		expect(res.rawPayload.byteLength).toBeGreaterThan(0);
	}, 60_000);

	it("returns 404 for unknown segment number", async () => {
		await handle.app.inject({ method: "GET", url: "/private/storage/demo-clip-001/mpd" });
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/storage/demo-clip-001/segment_v0_999999.m4s",
		});
		expect(res.statusCode).toBe(404);
	}, 60_000);

	it("returns 404 for image-type media on /mpd", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/storage/img-001/mpd",
		});
		expect(res.statusCode).toBe(404);
	});

	it("returns 404 for unknown video id on /mpd", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/storage/bogus/mpd",
		});
		expect(res.statusCode).toBe(404);
	});

	it("serves distinct MPD bytes for demo-clip-001 and uploaded-001", async () => {
		const clip = await handle.app.inject({
			method: "GET",
			url: "/private/storage/demo-clip-001/mpd",
		});
		const uploaded = await handle.app.inject({
			method: "GET",
			url: "/private/storage/uploaded-001/mpd",
		});
		expect(clip.statusCode).toBe(200);
		expect(uploaded.statusCode).toBe(200);
		expect(clip.rawPayload.equals(uploaded.rawPayload)).toBe(false);
	}, 60_000);

	it("serves audio segments (init_v1.mp4) for uploaded-001", async () => {
		await handle.app.inject({ method: "GET", url: "/private/storage/uploaded-001/mpd" });
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/storage/uploaded-001/init_v1.mp4",
		});
		expect(res.statusCode).toBe(200);
		expect(res.headers["content-type"]).toBe("video/mp4");
		expect(res.rawPayload.byteLength).toBeGreaterThan(0);
	}, 60_000);
});
