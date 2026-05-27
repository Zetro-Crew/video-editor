import { Logger } from "@ztube/observability";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { getOutputFilename } from "../../../../../shared/utils/file.utils.ts";
import { HttpStatus } from "../../../../../shared/utils/http-status.ts";
import { DirectRenderInputAdapter } from "../../../../render/adapters/inbound/direct/DirectRenderInputAdapter.ts";
import type { VideoRenderUseCase } from "../../../../render/application/use-cases/VideoRenderUseCase.ts";
import type { EditVideoJobStatePort } from "../../../application/ports/outbound/EditVideoJobStatePort.ts";
import { editVideoRequestSchema } from "./edit-video.schema.ts";
import type { RenderRequest } from "./edit-video.types.ts";

interface EditVideoControllerOptions {
	videoRenderUseCase: VideoRenderUseCase;
	editVideoJobStatePort: EditVideoJobStatePort;
	s3OutputPrefix: string;
}

export const editVideoController: FastifyPluginAsync<EditVideoControllerOptions> = async (
	fastify: FastifyInstance,
	opts,
): Promise<void> => {
	const { videoRenderUseCase, editVideoJobStatePort, s3OutputPrefix } = opts;

	const runJob = async (jobId: string, body: RenderRequest): Promise<void> => {
		const { jobId: _jobId, ...rawInput } = body;
		const renderInput = new DirectRenderInputAdapter(rawInput).build();
		const s3Key = `${s3OutputPrefix}/${getOutputFilename(body.format)}`;

		Logger.logInfo("[edit-video] job started", { jobId, format: body.format });
		const start = Date.now();

		try {
			const result = await videoRenderUseCase.execute(renderInput, s3Key, async (p) => {
				await editVideoJobStatePort.saveState(jobId, {
					status: "PROCESSING",
					progress: p,
				});
			});
			await editVideoJobStatePort.saveState(jobId, {
				status: "COMPLETED",
				progress: 100,
				outputFile: result.url,
				segments: result.segments,
			});
			Logger.logInfo("[edit-video] job completed", {
				jobId,
				durationMs: Date.now() - start,
				outputFile: result.url,
			});
		} catch (e) {
			const message = e instanceof Error ? e.message : "Edit-video job failed";
			Logger.logError("[edit-video] job failed", e instanceof Error ? e : new Error(message), {
				jobId,
				durationMs: Date.now() - start,
			});
			await editVideoJobStatePort.saveState(jobId, {
				status: "FAILED",
				progress: 0,
				error: message,
			});
		}
	};

	fastify.post("/edit-video", { schema: { body: editVideoRequestSchema } }, async (req, reply) => {
		const body = req.body as RenderRequest;
		const { jobId } = body;

		await editVideoJobStatePort.saveState(jobId, {
			status: "PROCESSING",
			progress: 0,
		});

		req.log.info({ jobId, format: body.format }, "edit-video job accepted");
		void runJob(jobId, body);

		return reply.status(HttpStatus.ACCEPTED).send({ jobId });
	});

	fastify.get("/edit-video/progress/:jobId", async (req, reply) => {
		const { jobId } = req.params as { jobId: string };
		const state = await editVideoJobStatePort.getState(jobId);
		if (!state) {
			return reply.status(HttpStatus.NOT_FOUND).send({ error: "Job not found" });
		}
		return reply.send({
			status: state.status,
			progress: state.progress,
			outputFile: state.outputFile,
			segments: state.segments,
			error: state.error,
		});
	});
};
