import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCoreMock, type CoreMockHandle } from "../index.ts";

describe("core-mock GET /private/media/:id/watch", () => {
	let handle: CoreMockHandle;

	beforeEach(async () => {
		handle = await buildCoreMock({ mockVodBaseUrl: "http://127.0.0.1:0" });
	});

	afterEach(async () => {
		await handle.app.close();
	});

	const cases: Array<{ id: string; type: string }> = [
		{ id: "img-001", type: "Image" },
		{ id: "img-002", type: "Image" },
		{ id: "img-003", type: "Image" },
		{ id: "demo-clip-001", type: "ClipVideo" },
		{ id: "uploaded-001", type: "UploadedVideo" },
		{ id: "screenshot-001", type: "ScreenShotFromLive" },
	];

	for (const { id, type } of cases) {
		it(`returns type=${type} + name for fixture id ${id}`, async () => {
			const res = await handle.app.inject({
				method: "GET",
				url: `/private/media/${id}/watch`,
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.body) as { type: string; name: string };
			expect(body.type).toBe(type);
			expect(typeof body.name).toBe("string");
			expect(body.name.length).toBeGreaterThan(0);
		});
	}

	it("returns 404 for unknown media id", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/media/bogus/watch",
		});
		expect(res.statusCode).toBe(404);
	});
});
