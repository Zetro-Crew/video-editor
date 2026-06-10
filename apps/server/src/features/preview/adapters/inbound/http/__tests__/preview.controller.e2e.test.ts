import { buildCoreMock, type CoreMockHandle } from "@video-editor/core-mock";
import { buildMockVod, type MockVodHandle } from "@video-editor/mock-vod";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ApiEnvConfig } from "../../../../../../config/env.ts";
import {
	createFastifyInstance,
	type TypedFastify,
} from "../../../../../../infrastructure/fastify/fastify.ts";
import { InMemoryStorageAdapter } from "../../../../../../infrastructure/storage/__tests__/InMemoryStorageAdapter.ts";
import { previewController } from "../preview.controller.ts";

async function listenEphemeral(app: FastifyInstance): Promise<string> {
	await app.listen({ port: 0, host: "127.0.0.1" });
	const addr = app.server.address();
	if (!addr || typeof addr === "string") throw new Error("no address");
	return `http://127.0.0.1:${addr.port}`;
}

describe("preview.controller E2E (core-mock + mock-vod + server)", () => {
	let mockVod: MockVodHandle;
	let coreMock: CoreMockHandle;
	let mockVodUrl: string;
	let coreUrl: string;
	let server: TypedFastify;
	let storage: InMemoryStorageAdapter;

	beforeEach(async () => {
		mockVod = await buildMockVod();
		mockVodUrl = await listenEphemeral(mockVod.app);
		coreMock = await buildCoreMock({ mockVodBaseUrl: mockVodUrl, tokenTtlMs: 60_000 });
		coreUrl = await listenEphemeral(coreMock.app);

		storage = new InMemoryStorageAdapter();
		server = createFastifyInstance();
		const config = {
			CORE_BASE_URL: `${coreUrl}/private`,
			SERVER_BASE_URL: "http://server.local",
			MAX_PREVIEW_DURATION_MS: 60_000,
			PREVIEW_JOB_TTL_SECONDS: 86400,
			S3_PREVIEW_PREFIX: "preview",
			PREVIEW_SIGNING_SECRET: "test-secret-for-url-signing-32characters",
		} as unknown as ApiEnvConfig;
		await server.register(previewController, { storage, config });
	});

	afterEach(async () => {
		await server.close();
		await coreMock.app.close();
		await mockVod.app.close();
	});

	it("end-to-end: preview-source → playlist in storage → segment proxy fetches from mock-vod", async () => {
		const { startMs, endMs } = mockVod.fixtureWindow;
		const res = await server.inject({
			method: "POST",
			url: "/editor/preview-source",
			payload: {
				source: {
					type: "channel-range",
					channelId: "ch-001",
					startTimeMs: startMs,
					endTimeMs: Math.min(endMs, startMs + 15_000),
				},
			},
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body) as {
			type: string;
			playlistUrl: string;
			width: number;
			height: number;
		};
		expect(body.type).toBe("hls");
		expect(body.width).toBe(1280);
		expect(body.height).toBe(720);

		const key = body.playlistUrl.replace("internal://", "");
		const playlist = storage.readText(key);
		if (!playlist) throw new Error("playlist not stored");
		expect(playlist).toContain("http://server.local/editor/segment?url=");

		const segmentLine = playlist
			.split("\n")
			.find((l) => l.startsWith("http://server.local/editor/segment?url="));
		if (!segmentLine) throw new Error("segment line not found");

		// GET the proxy segment URL through the server — it should hit mock-vod and stream bytes back.
		const proxyPath = segmentLine.replace("http://server.local", "");
		const segRes = await server.inject({ method: "GET", url: proxyPath });
		expect(segRes.statusCode).toBe(200);
		expect(segRes.rawPayload.length).toBeGreaterThan(0);
	});

	it("range outside fixture window → 400 (adapter throws RangeError on core 404)", async () => {
		const { endMs } = mockVod.fixtureWindow;
		const res = await server.inject({
			method: "POST",
			url: "/editor/preview-source",
			payload: {
				source: {
					type: "channel-range",
					channelId: "ch-001",
					startTimeMs: endMs + 1_000,
					endTimeMs: endMs + 5_000,
				},
			},
		});
		expect(res.statusCode).toBe(400);
	});
});
