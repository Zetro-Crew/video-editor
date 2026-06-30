import {
	type SaveProjectBody,
	getProjectResponseSchema,
	listProjectsResponseSchema,
	saveProjectBodySchema,
	saveProjectResponseSchema,
} from "@video-editor/contract/internal/project";
import { HttpError } from "@ztube/observability/fastify";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { Request } from "../../../../../infrastructure/fastify/fastify.ts";
import { HttpStatus } from "../../../../../shared/utils/http-status.ts";
import { ProjectNotFoundError } from "../../../application/use-cases/GetProjectUseCase.ts";
import type { GetProjectUseCase } from "../../../application/use-cases/GetProjectUseCase.ts";
import type { ListProjectsUseCase } from "../../../application/use-cases/ListProjectsUseCase.ts";
import type { SaveProjectUseCase } from "../../../application/use-cases/SaveProjectUseCase.ts";

interface ProjectControllerOptions {
	saveProjectUseCase: SaveProjectUseCase;
	getProjectUseCase: GetProjectUseCase;
	listProjectsUseCase: ListProjectsUseCase;
}

export const projectController: FastifyPluginAsync<ProjectControllerOptions> = async (
	fastify,
	opts,
): Promise<void> => {
	const { saveProjectUseCase, getProjectUseCase, listProjectsUseCase } = opts;

	fastify.post(
		"/projects",
		{ schema: { body: saveProjectBodySchema, response: { 201: saveProjectResponseSchema } } },
		async (req: Request<SaveProjectBody>, reply: FastifyReply) => {
			const { name, design } = req.body;
			const result = await saveProjectUseCase.execute({ name, design });
			return reply.status(HttpStatus.CREATED).send(result);
		},
	);

	fastify.get(
		"/projects",
		{ schema: { response: { 200: listProjectsResponseSchema } } },
		async (_req, reply: FastifyReply) => {
			const projects = await listProjectsUseCase.execute();
			return reply.send(projects);
		},
	);

	fastify.get(
		"/projects/:id",
		{ schema: { response: { 200: getProjectResponseSchema } } },
		async (req: Request<never, never, { id: string }>, reply: FastifyReply) => {
			const { id } = req.params;
			try {
				const project = await getProjectUseCase.execute(id);
				return reply.send({
					...project,
					createdAt: project.createdAt.toISOString(),
					updatedAt: project.updatedAt.toISOString(),
				});
			} catch (err) {
				if (err instanceof ProjectNotFoundError) {
					throw new HttpError({
						statusCode: HttpStatus.NOT_FOUND,
						message: err.message,
						expose: true,
						cause: err,
					});
				}
				throw err;
			}
		},
	);
};
