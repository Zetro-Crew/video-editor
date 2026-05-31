import { setTimeout as wait } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMockVod, type MockVodHandle } from "../index.ts";

describe("POST /__internal/register-token", () => {
	let handle: MockVodHandle;

	beforeEach(async () => {
		handle = await buildMockVod();
	});

	afterEach(async () => {
		await handle.app.close();
	});

	it("registers a token; validate returns recordingId", async () => {
		const res = await handle.app.inject({
			method: "POST",
			url: "/__internal/register-token",
			payload: { token: "abc", recordingId: "demo-recording", ttlMs: 10_000 },
		});
		expect(res.statusCode).toBe(204);
		expect(handle.tokenStore.validate("abc")).toBe("demo-recording");
	});

	it("validate returns null after TTL elapses", async () => {
		const res = await handle.app.inject({
			method: "POST",
			url: "/__internal/register-token",
			payload: { token: "ttl", recordingId: "demo-recording", ttlMs: 5 },
		});
		expect(res.statusCode).toBe(204);
		await wait(15);
		expect(handle.tokenStore.validate("ttl")).toBeNull();
	});

	it("400 on missing fields", async () => {
		const res = await handle.app.inject({
			method: "POST",
			url: "/__internal/register-token",
			payload: { token: "x" },
		});
		expect(res.statusCode).toBe(400);
	});
});
