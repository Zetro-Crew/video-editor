import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyPluginAsync } from "fastify";
import type { TokenStore } from "../token-store.ts";

interface Options {
	tokenStore: TokenStore;
	fixtureDir: string;
}

export const manifestRoute: FastifyPluginAsync<Options> = async (
	fastify,
	{ tokenStore, fixtureDir },
) => {
	fastify.get<{ Params: { recordingId: string } }>(
		"/vod/:recordingId/manifest.mpd",
		async (req, reply) => {
			const token = req.headers["vod-token"];
			if (typeof token !== "string" || !token) {
				return reply.status(401).send({ error: "Missing vod-token header" });
			}
			const recordingId = tokenStore.validate(token);
			if (!recordingId || recordingId !== req.params.recordingId) {
				return reply.status(401).send({ error: "Invalid or expired vod-token" });
			}
			const body = await readFile(path.join(fixtureDir, "manifest.mpd"));
			reply.header("Content-Type", "application/dash+xml");
			return reply.send(body);
		},
	);
};
