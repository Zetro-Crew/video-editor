import { setTimeout as wait } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMockVod, type MockVodHandle } from "../index.ts";

describe("GET /vod/:recordingId/manifest.mpd", () => {
	let handle: MockVodHandle;

	beforeEach(async () => {
		handle = await buildMockVod();
	});

	afterEach(async () => {
		await handle.app.close();
	});

	async function register(token: string, ttlMs = 10_000) {
		await handle.app.inject({
			method: "POST",
			url: "/__internal/register-token",
			payload: { token, recordingId: "demo-recording", ttlMs },
		});
	}

	it("401 without vod-token header", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/vod/demo-recording/manifest.mpd",
		});
		expect(res.statusCode).toBe(401);
	});

	it("401 with unregistered token", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/vod/demo-recording/manifest.mpd",
			headers: { "vod-token": "nope" },
		});
		expect(res.statusCode).toBe(401);
	});

	it("401 with expired token", async () => {
		await register("expiring", 5);
		await wait(15);
		const res = await handle.app.inject({
			method: "GET",
			url: "/vod/demo-recording/manifest.mpd",
			headers: { "vod-token": "expiring" },
		});
		expect(res.statusCode).toBe(401);
	});

	it("200 + DASH content type + MPD body for valid token", async () => {
		await register("good");
		const res = await handle.app.inject({
			method: "GET",
			url: "/vod/demo-recording/manifest.mpd",
			headers: { "vod-token": "good" },
		});
		expect(res.statusCode).toBe(200);
		expect(res.headers["content-type"]).toBe("application/dash+xml");
		expect(res.body).toContain("<MPD");
		expect(res.body).toContain('id="v4"');
	});

	it("401 when token bound to a different recording id", async () => {
		await register("other");
		const res = await handle.app.inject({
			method: "GET",
			url: "/vod/wrong-recording/manifest.mpd",
			headers: { "vod-token": "other" },
		});
		expect(res.statusCode).toBe(401);
	});
});
