import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCoreMock, type CoreMockHandle } from "../index.ts";

describe("core-mock GET /private/videos/:id/play", () => {
	let handle: CoreMockHandle;

	beforeEach(async () => {
		handle = await buildCoreMock({
			mockVodBaseUrl: "http://127.0.0.1:0",
			selfBaseUrl: "http://core-mock.test",
		});
	});

	afterEach(async () => {
		await handle.app.close();
	});

	it("returns { url, timeRanges } pointing at /storage/{id}/mpd for ClipVideo", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/videos/demo-clip-001/play",
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body) as {
			url: string;
			timeRanges: number[][];
			token?: string;
		};
		expect(body.url).toBe("http://core-mock.test/private/storage/demo-clip-001/mpd");
		expect(body.timeRanges).toHaveLength(1);
		expect(body.timeRanges[0]).toHaveLength(2);
		expect(body.timeRanges[0][1]).toBeGreaterThan(body.timeRanges[0][0]);
		expect(body.token).toBeUndefined();
	});

	it("returns the same shape for UploadedVideo", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/videos/uploaded-001/play",
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body) as { url: string; timeRanges: number[][] };
		expect(body.url).toBe("http://core-mock.test/private/storage/uploaded-001/mpd");
		expect(body.timeRanges[0][1] - body.timeRanges[0][0]).toBe(15_000);
	});

	it("returns 404 for image-type media ids", async () => {
		for (const id of ["img-001", "screenshot-001"]) {
			const res = await handle.app.inject({
				method: "GET",
				url: `/private/videos/${id}/play`,
			});
			expect(res.statusCode, `id ${id}`).toBe(404);
		}
	});

	it("returns 404 for unknown video id", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/videos/bogus/play",
		});
		expect(res.statusCode).toBe(404);
	});
});
