import { randomUUID } from "node:crypto";
import { Logger } from "@ztube/observability";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ExportEventPublisherPort } from "../../../../../infrastructure/messaging/RabbitMQPublisher.ts";
import { getOutputFilename } from "../../../../../shared/utils/file.utils.ts";
import { HttpStatus } from "../../../../../shared/utils/http-status.ts";
import type { RenderRequest } from "../../../../edit-video/adapters/inbound/http/edit-video.types.ts";
import type { RenderJobStatePort } from "../../../application/ports/outbound/RenderJobStatePort.ts";
import type { VideoRenderUseCase } from "../../../application/use-cases/VideoRenderUseCase.ts";
import { DesignRenderInputAdapter } from "../design/DesignRenderInputAdapter.ts";
import { designPayloadSchema } from "./design-payload.schema.ts";

interface SaveMetadata {
	mediaName: string;
	downloadToComputer: boolean;
	saveToPersonalChannel: boolean;
	selectedChannelIds: string[];
	items: unknown[];
}

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

	const abortRegistry = new Map<string, AbortController>();

	const runRender = async (
		jobId: string,
		request: RenderRequest,
		signal: AbortSignal,
		exportType: "mp4" | "webp",
	): Promise<void> => {
		const { jobId: _jobId, ...renderInput } = request;
		const s3Key = `${s3OutputPrefix}/${getOutputFilename(request.format)}`;

		Logger.logInfo("[render] job started", { jobId, format: request.format });
		const start = Date.now();

		try {
			const result = await videoRenderUseCase.execute(
				renderInput,
				s3Key,
				async (p) => {
					if (!signal.aborted) {
						await renderJobStatePort.saveState(jobId, {
							status: "PROCESSING",
							progress: p,
						});
					}
				},
				signal,
			);
			if (!signal.aborted) {
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
				await exportEventPublisher.publishExportCompleted({
					jobId,
					url: result.url,
					exportType,
				});
			}
		} catch (err) {
			if (signal.aborted) {
				Logger.logInfo("[render] job cancelled", { jobId, durationMs: Date.now() - start });
				await renderJobStatePort.saveState(jobId, { status: "CANCELLED", progress: 0 });
			} else {
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
				await exportEventPublisher.publishExportFailed({ jobId, error: message });
			}
		} finally {
			abortRegistry.delete(jobId);
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

		const abortController = new AbortController();
		abortRegistry.set(jobId, abortController);

		req.log.info({ jobId, format }, "render job accepted");

		const exportType: "mp4" | "webp" = format === "webp" ? "webp" : "mp4";
		void runRender(jobId, renderRequest, abortController.signal, exportType);

		if (body.saveMetadata) {
			await exportEventPublisher.publishExportStarted({
				jobId,
				...body.saveMetadata,
				exportType,
			});
		}

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

	fastify.delete("/render", async (req: FastifyRequest, reply: FastifyReply) => {
		const { id: jobId } = req.query as StatusQuery;

		if (!jobId) {
			return reply.status(HttpStatus.BAD_REQUEST).send({ error: "id query param is required" });
		}

		const controller = abortRegistry.get(jobId);
		if (controller) {
			controller.abort();
		} else {
			const state = await renderJobStatePort.getState(jobId);
			if (!state) {
				return reply.status(HttpStatus.NOT_FOUND).send({ error: "Job not found" });
			}
		}

		req.log.info({ jobId }, "render job cancel requested");
		return reply.status(HttpStatus.NO_CONTENT).send();
	});
};
