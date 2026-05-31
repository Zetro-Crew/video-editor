import type { FastifyPluginAsync } from "fastify";

interface Options {
	startMs: number;
	endMs: number;
	recordingId: string;
}

export const fixtureWindowRoute: FastifyPluginAsync<Options> = async (
	fastify,
	{ startMs, endMs, recordingId },
) => {
	fastify.get("/__internal/fixture-window", async () => ({
		startMs,
		endMs,
		recordingId,
	}));
};
