import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCoreMock, type CoreMockHandle } from "../index.ts";

describe("core-mock GET /private/storage/:id/image", () => {
	let handle: CoreMockHandle;

	beforeEach(async () => {
		handle = await buildCoreMock({ mockVodBaseUrl: "http://127.0.0.1:0" });
	});

	afterEach(async () => {
		await handle.app.close();
	});

	it("returns image bytes with image/* Content-Type for a known fixture id", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/storage/img-001/image",
		});
		expect(res.statusCode).toBe(200);
		const ct = res.headers["content-type"];
		expect(typeof ct).toBe("string");
		expect(ct as string).toMatch(/^image\//);
		expect(res.rawPayload.byteLength).toBeGreaterThan(0);
	});

	it("returns 404 for an unknown fixture id", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/storage/does-not-exist/image",
		});
		expect(res.statusCode).toBe(404);
	});

	it("serves multiple distinct fixture ids", async () => {
		const ids = ["img-001", "img-002", "img-003"];
		for (const id of ids) {
			const res = await handle.app.inject({
				method: "GET",
				url: `/private/storage/${id}/image`,
			});
			expect(res.statusCode, `id ${id}`).toBe(200);
		}
	});
});
