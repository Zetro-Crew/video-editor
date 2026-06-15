import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCoreMock, type CoreMockHandle } from "../index.ts";

describe("core-mock GET /private/storage/:id/clip", () => {
	let handle: CoreMockHandle;

	beforeEach(async () => {
		handle = await buildCoreMock({ mockVodBaseUrl: "http://127.0.0.1:0" });
	});

	afterEach(async () => {
		await handle.app.close();
	});

	it("returns mp4 bytes for the demo clip id", { timeout: 15_000 }, async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/storage/demo-clip-001/clip",
		});
		expect(res.statusCode).toBe(200);
		expect(res.headers["content-type"]).toBe("video/mp4");
		expect(res.rawPayload.byteLength).toBeGreaterThan(0);
		expect(res.rawPayload.subarray(4, 8).toString("ascii")).toBe("ftyp");
	});

	it("returns 404 for an unknown clip id", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/storage/unknown-id/clip",
		});
		expect(res.statusCode).toBe(404);
	});
});
