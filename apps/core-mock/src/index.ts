import { randomBytes } from "node:crypto";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { ExportResultStore } from "./export-result-store.ts";
import { getDemoClipMp4 } from "./fixtures/clip.ts";
import { getDashFixture } from "./fixtures/dash.ts";
import { imageFixtures } from "./fixtures/images.ts";
import { isVideoType, videoPlayRegistry, watchRegistry } from "./fixtures/media-registry.ts";

const mockUser = {
	displayName: "דניאל ריספלר",
	id: "user-001",
};

const mockChannels = [
	{ _id: "ch-001", name: "ערוץ פיקוד מרכז", type: "unit", subType: "command" },
	{ _id: "ch-002", name: "ערוץ חטיבה 7", type: "unit", subType: "brigade" },
	{ _id: "ch-003", name: "ערוץ גדוד 51", type: "unit", subType: "battalion" },
	{ _id: "ch-004", name: "ערוץ פיקוד צפון", type: "unit", subType: "command" },
	{ _id: "ch-005", name: "ערוץ חיל האוויר", type: "unit", subType: "corps" },
	{ _id: "ch-006", name: "ערוץ חיל הים", type: "unit", subType: "corps" },
	{ _id: "ch-007", name: "ערוץ מחלקת הדרכה", type: "unit", subType: "department" },
	{ _id: "ch-008", name: 'ערוץ בסיס נח"ל', type: "unit", subType: "base" },
];

export interface BuildCoreMockOptions {
	mockVodBaseUrl?: string;
	tokenTtlMs?: number;
	logger?: boolean;
	/** Base URL the mock advertises in /videos/:id/play responses. Defaults to "http://127.0.0.1:8002". */
	selfBaseUrl?: string;
}

export interface CoreMockHandle {
	app: FastifyInstance;
	exportResultStore: ExportResultStore;
}

interface FixtureWindow {
	startMs: number;
	endMs: number;
	recordingId: string;
}

const MOCK_VOD_FETCH_TIMEOUT_MS = 2_000;

async function probeFixtureWindow(mockVodBaseUrl: string): Promise<FixtureWindow> {
	const res = await fetch(`${mockVodBaseUrl}/__internal/fixture-window`, {
		signal: AbortSignal.timeout(MOCK_VOD_FETCH_TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`fixture-window probe failed: ${res.status}`);
	return (await res.json()) as FixtureWindow;
}

export async function buildCoreMock(opts: BuildCoreMockOptions = {}): Promise<CoreMockHandle> {
	const mockVodBaseUrl = opts.mockVodBaseUrl ?? "http://127.0.0.1:5050";
	const tokenTtlMs = opts.tokenTtlMs ?? 600_000;
	const selfBaseUrl = opts.selfBaseUrl ?? "http://127.0.0.1:8002";

	const app = Fastify({ logger: opts.logger ?? false });
	await app.register(cors, { origin: true, credentials: true });

	const exportResultStore = new ExportResultStore();

	let cachedWindow: FixtureWindow | undefined;

	app.get("/private/users/me", async () => mockUser);
	app.get("/private/media/clip/managed-virtual-channels", async () => mockChannels);

	app.get<{ Params: { id: string } }>("/private/storage/:id/image", async (req, reply) => {
		const fixture = imageFixtures[req.params.id];
		if (!fixture) {
			return reply.status(404).send({ error: "Unknown image id" });
		}
		return reply
			.header("Content-Type", fixture.contentType)
			.header("Cache-Control", "public, max-age=300")
			.send(fixture.body);
	});

	app.get<{ Params: { id: string } }>("/private/storage/:id/clip", async (req, reply) => {
		if (req.params.id !== "demo-clip-001") {
			return reply.status(404).send({ error: "Unknown clip id" });
		}
		const body = await getDemoClipMp4();
		return reply
			.header("Content-Type", "video/mp4")
			.header("Cache-Control", "public, max-age=300")
			.send(body);
	});

	app.get<{ Params: { id: string } }>("/private/media/:id/watch", async (req, reply) => {
		const entry = watchRegistry[req.params.id];
		if (!entry) {
			return reply.status(404).send({ error: "Unknown media id" });
		}
		return entry;
	});

	app.get<{ Params: { id: string } }>("/private/videos/:id/play", async (req, reply) => {
		const watch = watchRegistry[req.params.id];
		if (!watch || !isVideoType(watch.type)) {
			return reply.status(404).send({ error: "Unknown video id" });
		}
		const playEntry = videoPlayRegistry[req.params.id];
		if (!playEntry) {
			return reply.status(404).send({ error: "Unknown video id" });
		}
		return {
			url: `${selfBaseUrl}/private/storage/${encodeURIComponent(req.params.id)}/mpd`,
			timeRanges: [[playEntry.mediaCreatedAtMs, playEntry.mediaCreatedAtMs + playEntry.durationMs]],
		};
	});

	app.get<{ Params: { id: string } }>("/private/storage/:id/mpd", async (req, reply) => {
		const watch = watchRegistry[req.params.id];
		if (!watch || !isVideoType(watch.type)) {
			return reply.status(404).send({ error: "Unknown video id" });
		}
		const fixture = await getDashFixture(req.params.id);
		return reply
			.header("Content-Type", "application/dash+xml")
			.header("Cache-Control", "no-store")
			.send(fixture.mpd);
	});

	app.get<{ Params: { id: string; filename: string } }>(
		"/private/storage/:id/:filename",
		async (req, reply) => {
			const { id, filename } = req.params;
			const watch = watchRegistry[id];
			if (!watch || !isVideoType(watch.type)) {
				return reply.status(404).send({ error: "Unknown video id" });
			}
			const fixture = await getDashFixture(id);
			if (/^init_v\d+\.mp4$/.test(filename)) {
				const init = fixture.inits.get(filename);
				if (!init) {
					return reply.status(404).send({ error: "Unknown init segment" });
				}
				return reply
					.header("Content-Type", "video/mp4")
					.header("Cache-Control", "public, max-age=300")
					.send(init);
			}
			if (/^segment_v\d+_\d+\.m4s$/.test(filename)) {
				const seg = fixture.segments.get(filename);
				if (!seg) {
					return reply.status(404).send({ error: "Unknown segment" });
				}
				return reply
					.header("Content-Type", "video/iso.segment")
					.header("Cache-Control", "public, max-age=300")
					.send(seg);
			}
			return reply.status(404).send({ error: "Unknown storage path" });
		},
	);

	app.get<{
		Params: { channelId: string };
		Querystring: { start?: string; end?: string };
	}>("/private/channels/:channelId/play", async (req, reply) => {
		const start = Number(req.query.start ?? 0);
		const end = Number(req.query.end ?? 0);
		if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
			return reply.status(400).send({ error: "Invalid start/end" });
		}

		if (!cachedWindow) {
			try {
				cachedWindow = await probeFixtureWindow(mockVodBaseUrl);
			} catch (err) {
				app.log.warn({ err }, "fixture-window probe failed");
				return reply.status(502).send({ error: "Mock VOD unreachable" });
			}
		}

		const { startMs, endMs, recordingId } = cachedWindow;
		const clippedEnd = Math.min(end, endMs);
		if (clippedEnd <= Math.max(start, startMs)) {
			return reply.status(404).send({
				error: `Range [${start}, ${end}] does not overlap fixture window [${startMs}, ${endMs}]`,
			});
		}
		// timeRanges[0][0] MUST be the wall-clock anchor of segment startNumber, not the
		// clipped user-requested start. See CONTEXT.md "Channel Play API".

		const token = randomBytes(18).toString("base64url");
		try {
			const registerRes = await fetch(`${mockVodBaseUrl}/__internal/register-token`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ token, recordingId, ttlMs: tokenTtlMs }),
				signal: AbortSignal.timeout(MOCK_VOD_FETCH_TIMEOUT_MS),
			});
			if (!registerRes.ok) {
				app.log.warn({ status: registerRes.status }, "register-token returned non-2xx");
			}
		} catch (err) {
			app.log.warn({ err }, "register-token POST failed");
		}

		return {
			url: `${mockVodBaseUrl}/vod/${recordingId}/manifest.mpd`,
			timeRanges: [[startMs, clippedEnd]],
			token,
		};
	});

	app.get("/export-result/stream", (req, reply) => {
		reply.hijack();
		const res = reply.raw;
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache");
		res.setHeader("Connection", "keep-alive");
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.flushHeaders();

		const latest = exportResultStore.getLatest();
		if (latest) {
			res.write(`data: ${JSON.stringify(latest)}\n\n`);
		}

		exportResultStore.subscribe(res);

		const keepAlive = setInterval(() => {
			res.write(": keepalive\n\n");
		}, 30_000);

		req.socket.on("close", () => {
			clearInterval(keepAlive);
			exportResultStore.unsubscribe(res);
		});
	});

	return { app, exportResultStore };
}
