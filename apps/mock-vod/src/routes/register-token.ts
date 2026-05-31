import type { FastifyPluginAsync } from "fastify";
import type { TokenStore } from "../token-store.ts";

interface RegisterTokenBody {
	token: string;
	recordingId: string;
	ttlMs: number;
}

interface Options {
	tokenStore: TokenStore;
}

export const registerTokenRoute: FastifyPluginAsync<Options> = async (fastify, { tokenStore }) => {
	fastify.post<{ Body: RegisterTokenBody }>("/__internal/register-token", async (req, reply) => {
		const { token, recordingId, ttlMs } = req.body ?? {};
		if (
			typeof token !== "string" ||
			!token ||
			typeof recordingId !== "string" ||
			!recordingId ||
			typeof ttlMs !== "number" ||
			ttlMs <= 0
		) {
			return reply.status(400).send({ error: "Missing token/recordingId/ttlMs" });
		}
		tokenStore.issue({ token, recordingId, ttlMs });
		return reply.status(204).send();
	});
};
