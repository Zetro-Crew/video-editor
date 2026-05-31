import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMockVod, type MockVodHandle } from "../index.ts";

const fixtureDir = path.join(import.meta.dirname, "..", "fixture");

describe("GET /vod/:recordingId/media/*", () => {
	let handle: MockVodHandle;

	beforeEach(async () => {
		handle = await buildMockVod();
		await handle.app.inject({
			method: "POST",
			url: "/__internal/register-token",
			payload: { token: "good", recordingId: "demo-recording", ttlMs: 60_000 },
		});
	});

	afterEach(async () => {
		await handle.app.close();
	});

	it("200 init segment bytes match fixture", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/vod/demo-recording/media/v4_init.mp4",
			headers: { "vod-token": "good" },
		});
		expect(res.statusCode).toBe(200);
		expect(res.headers["content-type"]).toBe("video/mp4");
		const expected = await readFile(path.join(fixtureDir, "v4_init.mp4"));
		expect(res.rawPayload.equals(expected)).toBe(true);
	});

	it("200 m4s segment with video/iso.segment", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/vod/demo-recording/media/segment_v4_2362.m4s",
			headers: { "vod-token": "good" },
		});
		expect(res.statusCode).toBe(200);
		expect(res.headers["content-type"]).toBe("video/iso.segment");
	});

	it("401 without token", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/vod/demo-recording/media/v4_init.mp4",
		});
		expect(res.statusCode).toBe(401);
	});

	it("404 for unknown filename", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/vod/demo-recording/media/missing.mp4",
			headers: { "vod-token": "good" },
		});
		expect(res.statusCode).toBe(404);
	});
});
