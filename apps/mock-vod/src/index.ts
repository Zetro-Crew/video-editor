import path from "node:path";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import {
	DEFAULT_TOKEN_TTL_MS,
	FIXTURE_WINDOW_END_MS,
	FIXTURE_WINDOW_START_MS,
	RECORDING_ID,
} from "./config.ts";
import { fixtureWindowRoute } from "./routes/fixture-window.ts";
import { manifestRoute } from "./routes/manifest.ts";
import { registerTokenRoute } from "./routes/register-token.ts";
import { segmentRoute } from "./routes/segment.ts";
import { createTokenStore, type TokenStore } from "./token-store.ts";

export interface BuildMockVodOptions {
	tokenStore?: TokenStore;
	fixtureWindow?: { startMs: number; endMs: number };
	recordingId?: string;
	fixtureDir?: string;
	logger?: boolean;
}

export interface MockVodHandle {
	app: FastifyInstance;
	tokenStore: TokenStore;
	tokenTtlMs: number;
	fixtureWindow: { startMs: number; endMs: number; recordingId: string };
}

const defaultFixtureDir = path.join(import.meta.dirname, "fixture");

export async function buildMockVod(opts: BuildMockVodOptions = {}): Promise<MockVodHandle> {
	const tokenStore = opts.tokenStore ?? createTokenStore();
	const fixtureDir = opts.fixtureDir ?? defaultFixtureDir;
	const recordingId = opts.recordingId ?? RECORDING_ID;
	const fixtureWindow = {
		startMs: opts.fixtureWindow?.startMs ?? FIXTURE_WINDOW_START_MS,
		endMs: opts.fixtureWindow?.endMs ?? FIXTURE_WINDOW_END_MS,
		recordingId,
	};

	const app = Fastify({ logger: opts.logger ?? false });
	await app.register(cors, { origin: true });
	await app.register(registerTokenRoute, { tokenStore });
	await app.register(fixtureWindowRoute, fixtureWindow);
	await app.register(manifestRoute, { tokenStore, fixtureDir });
	await app.register(segmentRoute, { tokenStore, fixtureDir });

	return {
		app,
		tokenStore,
		tokenTtlMs: DEFAULT_TOKEN_TTL_MS,
		fixtureWindow,
	};
}

export type { TokenStore } from "./token-store.ts";
