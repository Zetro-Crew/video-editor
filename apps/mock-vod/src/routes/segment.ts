import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyPluginAsync } from "fastify";
import type { TokenStore } from "../token-store.ts";

interface Options {
	tokenStore: TokenStore;
	fixtureDir: string;
}

function contentTypeFor(filename: string): string {
	const ext = path.extname(filename).toLowerCase();
	if (ext === ".mp4") return "video/mp4";
	if (ext === ".m4s") return "video/iso.segment";
	return "application/octet-stream";
}

export const segmentRoute: FastifyPluginAsync<Options> = async (
	fastify,
	{ tokenStore, fixtureDir },
) => {
	fastify.get<{ Params: { recordingId: string; "*": string } }>(
		"/vod/:recordingId/media/*",
		async (req, reply) => {
			const token = req.headers["vod-token"];
			if (typeof token !== "string" || !token) {
				return reply.status(401).send({ error: "Missing vod-token header" });
			}
			const recordingId = tokenStore.validate(token);
			if (!recordingId || recordingId !== req.params.recordingId) {
				return reply.status(401).send({ error: "Invalid or expired vod-token" });
			}

			const requested = req.params["*"];
			if (!requested || requested.includes("..") || requested.includes("/")) {
				return reply.status(400).send({ error: "Invalid path" });
			}

			const filePath = path.join(fixtureDir, requested);
			try {
				await stat(filePath);
			} catch {
				return reply.status(404).send({ error: "Segment not found" });
			}

			reply.header("Content-Type", contentTypeFor(requested));
			return reply.send(createReadStream(filePath));
		},
	);
};
