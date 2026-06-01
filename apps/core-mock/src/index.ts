import { randomBytes } from "node:crypto";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { ExportResultStore } from "./export-result-store.ts";

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

	const app = Fastify({ logger: opts.logger ?? false });
	await app.register(cors, { origin: true, credentials: true });

	const exportResultStore = new ExportResultStore();

	let cachedWindow: FixtureWindow | undefined;

	app.get("/private/users/me", async () => mockUser);
	app.get("/private/media/clip/managed-virtual-channels", async () => mockChannels);

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
