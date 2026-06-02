import { randomUUID } from "node:crypto";
import { savedMediaPayloadSchema } from "@video-editor/contract/events";
import type { RenderRequest } from "@video-editor/contract/internal/edit-video";
import { designPayloadSchema } from "@video-editor/contract/internal/render";
import { Logger } from "@ztube/observability";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import type { ExportEventPublisherPort } from "../../../../../infrastructure/messaging/RabbitMQPublisher.ts";
import { getOutputFilename } from "../../../../../shared/utils/file.utils.ts";
import { HttpStatus } from "../../../../../shared/utils/http-status.ts";
import type { RenderJobStatePort } from "../../../application/ports/outbound/RenderJobStatePort.ts";
import type { VideoRenderUseCase } from "../../../application/use-cases/VideoRenderUseCase.ts";
import { DesignRenderInputAdapter } from "../design/DesignRenderInputAdapter.ts";

const saveMetadataSchema = savedMediaPayloadSchema.omit({ exportType: true });
type SaveMetadata = z.infer<typeof saveMetadataSchema>;

interface StartRenderBody {
	design: unknown;
	options?: {
		fps?: number;
		format?: string;
		size?: unknown;
		frameTimeMs?: number;
	};
	saveMetadata?: SaveMetadata;
}

interface StatusQuery {
	id?: string;
	type?: string;
}

const getRequestedFormat = (format?: string): RenderRequest["format"] => {
	if (format === "webp") return "webp";
	if (format === "dash") return "dash";
	return "mp4";
};

const getRequestedFrameTimeMs = (frameTimeMs?: number): number | undefined =>
	typeof frameTimeMs === "number" && Number.isFinite(frameTimeMs) ? frameTimeMs : undefined;

interface RenderControllerOptions {
	videoRenderUseCase: VideoRenderUseCase;
	renderJobStatePort: RenderJobStatePort;
	s3OutputPrefix: string;
	exportEventPublisher: ExportEventPublisherPort;
}

export const renderController: FastifyPluginAsync<RenderControllerOptions> = async (
	fastify,
	opts,
): Promise<void> => {
	const { videoRenderUseCase, renderJobStatePort, s3OutputPrefix, exportEventPublisher } = opts;

	const runRender = async (
		jobId: string,
		request: RenderRequest,
		exportType: "mp4" | "webp",
		startPromise: Promise<void>,
	): Promise<void> => {
		const { jobId: _jobId, ...renderInput } = request;
		const s3Key = `${s3OutputPrefix}/${getOutputFilename(request.format)}`;

		Logger.logInfo("[render] job started", { jobId, format: request.format });
		const start = Date.now();

		const awaitStart = async (): Promise<void> => {
			try {
				await startPromise;
			} catch (publishErr) {
				const message = publishErr instanceof Error ? publishErr.message : "publish failed";
				Logger.logError(
					"[render] export.started publish failed",
					publishErr instanceof Error ? publishErr : new Error(message),
					{ jobId },
				);
			}
		};

		try {
			const result = await videoRenderUseCase.execute(renderInput, s3Key, async (p) => {
				await renderJobStatePort.saveState(jobId, {
					status: "PROCESSING",
					progress: p,
				});
			});
			await renderJobStatePort.saveState(jobId, {
				status: "COMPLETED",
				progress: 100,
				url: result.url,
			});
			Logger.logInfo("[render] job completed", {
				jobId,
				durationMs: Date.now() - start,
				url: result.url,
			});
			await awaitStart();
			await exportEventPublisher.publishExportCompleted({
				jobId,
				url: result.url,
				exportType,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : "Render failed";
			Logger.logError("[render] job failed", err instanceof Error ? err : new Error(message), {
				jobId,
				durationMs: Date.now() - start,
			});
			await renderJobStatePort.saveState(jobId, {
				status: "FAILED",
				progress: 0,
				error: message,
			});
			await awaitStart();
			await exportEventPublisher.publishExportFailed({ jobId, error: message });
		}
	};

	fastify.post("/render", async (req: FastifyRequest, reply: FastifyReply) => {
		const body = req.body as StartRenderBody;

		const parseResult = designPayloadSchema.safeParse(body?.design);
		if (!parseResult.success) {
			const issue = parseResult.error.issues[0];
			const path = issue?.path.join(".") ?? "";
			const message = issue?.message ?? "Invalid design payload";
			return reply
				.status(HttpStatus.BAD_REQUEST)
				.send({ error: path ? `${path}: ${message}` : message });
		}

		const jobId = randomUUID();
		const format = getRequestedFormat(body.options?.format);
		const frameTimeMs = getRequestedFrameTimeMs(body.options?.frameTimeMs);

		const renderInput = new DesignRenderInputAdapter(parseResult.data, format, frameTimeMs).build();
		const renderRequest: RenderRequest = { ...renderInput, jobId };

		await renderJobStatePort.saveState(jobId, {
			status: "PROCESSING",
			progress: 0,
		});

		req.log.info({ jobId, format }, "render job accepted");

		const exportType: "mp4" | "webp" = format === "webp" ? "webp" : "mp4";

		let startPromise: Promise<void> = Promise.resolve();
		if (body.saveMetadata !== undefined) {
			const saveMetadataParse = saveMetadataSchema.safeParse(body.saveMetadata);
			if (!saveMetadataParse.success) {
				const issue = saveMetadataParse.error.issues[0];
				const path = issue?.path.join(".") ?? "";
				const message = issue?.message ?? "Invalid saveMetadata";
				return reply
					.status(HttpStatus.BAD_REQUEST)
					.send({ error: path ? `saveMetadata.${path}: ${message}` : message });
			}
			startPromise = exportEventPublisher.publishExportStarted({
				...saveMetadataParse.data,
				jobId,
				exportType,
			});
		}

		void runRender(jobId, renderRequest, exportType, startPromise);

		return reply.status(HttpStatus.ACCEPTED).send({ id: jobId });
	});

	fastify.get("/render", async (req: FastifyRequest, reply: FastifyReply) => {
		const { id: jobId } = req.query as StatusQuery;

		if (!jobId) {
			return reply.status(HttpStatus.BAD_REQUEST).send({ error: "id query param is required" });
		}

		const state = await renderJobStatePort.getState(jobId);
		if (!state) {
			return reply.status(HttpStatus.NOT_FOUND).send({ error: "Job not found" });
		}

		return reply.send({
			status: state.status,
			progress: state.progress,
			url: state.url,
			error: state.error,
			presigned_url: state.url,
		});
	});
};
