import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCoreMock, type CoreMockHandle } from "../index.ts";

const FIXTURE_START = 1_778_412_270_000;
const FIXTURE_END = FIXTURE_START + 600_000;

interface RegisteredToken {
	token: string;
	recordingId: string;
	ttlMs: number;
}

interface StubHandle {
	app: FastifyInstance;
	baseUrl: string;
	registered: RegisteredToken[];
}

async function startMockVodStub(): Promise<StubHandle> {
	const app = Fastify({ logger: false });
	const registered: RegisteredToken[] = [];

	app.get("/__internal/fixture-window", async () => ({
		startMs: FIXTURE_START,
		endMs: FIXTURE_END,
		recordingId: "demo-recording",
	}));
	app.post<{ Body: RegisteredToken }>("/__internal/register-token", async (req, reply) => {
		registered.push(req.body);
		return reply.status(204).send();
	});

	await app.listen({ port: 0, host: "127.0.0.1" });
	const addr = app.server.address();
	if (!addr || typeof addr === "string") throw new Error("no address");
	return { app, baseUrl: `http://127.0.0.1:${addr.port}`, registered };
}

describe("core-mock GET /private/channels/:id/play", () => {
	let stub: StubHandle;
	let handle: CoreMockHandle;

	beforeEach(async () => {
		stub = await startMockVodStub();
		handle = await buildCoreMock({ mockVodBaseUrl: stub.baseUrl, tokenTtlMs: 60_000 });
	});

	afterEach(async () => {
		await handle.app.close();
		await stub.app.close();
	});

	it("returns clipped timeRanges, absolute MPD url, base64url token, and registers token with mock-vod", async () => {
		const start = FIXTURE_START - 5_000;
		const end = FIXTURE_START + 10_000;
		const res = await handle.app.inject({
			method: "GET",
			url: `/private/channels/ch-001/play?start=${start}&end=${end}`,
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body) as {
			url: string;
			timeRanges: number[][];
			token: string;
		};
		expect(body.url).toBe(`${stub.baseUrl}/vod/demo-recording/manifest.mpd`);
		expect(body.timeRanges).toEqual([[FIXTURE_START, end]]);
		expect(body.token).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(body.token.length).toBeGreaterThanOrEqual(20);

		expect(stub.registered).toHaveLength(1);
		expect(stub.registered[0]).toEqual({
			token: body.token,
			recordingId: "demo-recording",
			ttlMs: 60_000,
		});
	});

	it("404 when requested range outside fixture window", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: `/private/channels/ch-001/play?start=${FIXTURE_END + 1}&end=${FIXTURE_END + 5_000}`,
		});
		expect(res.statusCode).toBe(404);
	});

	it("400 on invalid range", async () => {
		const res = await handle.app.inject({
			method: "GET",
			url: "/private/channels/ch-001/play?start=10&end=5",
		});
		expect(res.statusCode).toBe(400);
	});
});
