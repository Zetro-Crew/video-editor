import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpStatus } from "../../../../../shared/utils/http-status.ts";
import type { LoadDraftUseCase } from "../../../application/use-cases/LoadDraftUseCase.ts";
import type { SaveDraftUseCase } from "../../../application/use-cases/SaveDraftUseCase.ts";

const saveDraftBodySchema = z.object({
	projectId: z.string().min(1),
	design: z.unknown(),
});

const loadDraftQuerySchema = z.object({
	projectId: z.string().min(1),
});

interface DraftControllerOptions {
	saveDraftUseCase: SaveDraftUseCase;
	loadDraftUseCase: LoadDraftUseCase;
}

export const draftController: FastifyPluginAsync<DraftControllerOptions> = async (
	fastify,
	opts,
): Promise<void> => {
	const { saveDraftUseCase, loadDraftUseCase } = opts;

	fastify.put("/editor/draft", async (req: FastifyRequest, reply: FastifyReply) => {
		const parse = saveDraftBodySchema.safeParse(req.body);
		if (!parse.success) {
			const issue = parse.error.issues[0];
			return reply
				.status(HttpStatus.BAD_REQUEST)
				.send({ error: issue?.message ?? "Invalid request body" });
		}

		const { projectId, design } = parse.data;
		await saveDraftUseCase.execute(projectId, design);
		return reply.status(HttpStatus.OK).send({});
	});

	fastify.get("/editor/draft", async (req: FastifyRequest, reply: FastifyReply) => {
		const parse = loadDraftQuerySchema.safeParse(req.query);
		if (!parse.success) {
			const issue = parse.error.issues[0];
			return reply
				.status(HttpStatus.BAD_REQUEST)
				.send({ error: issue?.message ?? "Invalid query params" });
		}

		const { projectId } = parse.data;
		const result = await loadDraftUseCase.execute(projectId);
		if (!result) {
			return reply.status(HttpStatus.NOT_FOUND).send({ error: "No draft found" });
		}
		return reply.status(HttpStatus.OK).send(result);
	});
};
