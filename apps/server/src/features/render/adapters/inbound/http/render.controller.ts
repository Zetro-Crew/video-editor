import { randomUUID } from "node:crypto";
import {
	type RenderRequestBody,
	type RenderSaveMetadata,
	renderRequestSchema,
} from "@video-editor/contract/internal/render";
import { HttpError } from "@ztube/observability/fastify";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { Request } from "../../../../../infrastructure/fastify/fastify.ts";
import { PublishExhaustedError } from "../../../../../infrastructure/messaging/RabbitMQPublisher.ts";
import { HttpStatus } from "../../../../../shared/utils/http-status.ts";
import type { RenderCommandPort } from "../../../application/ports/outbound/RenderCommandPort.ts";
import { DesignRenderInputAdapter } from "../design/DesignRenderInputAdapter.ts";

type RenderFormat = "mp4" | "webp" | "dash";

const getRequestedFormat = (format?: string): RenderFormat => {
	if (format === "webp") return "webp";
	if (format === "dash") return "dash";
	return "mp4";
};

const getRequestedFrameTimeMs = (frameTimeMs?: number): number | undefined =>
	typeof frameTimeMs === "number" && Number.isFinite(frameTimeMs) ? frameTimeMs : undefined;

interface RenderControllerOptions {
	renderCommandPort: RenderCommandPort;
}

export const renderController: FastifyPluginAsync<RenderControllerOptions> = async (
	fastify,
	opts,
): Promise<void> => {
	const { renderCommandPort } = opts;

	fastify.post(
		"/render",
		{ schema: renderRequestSchema },
		async (req: Request<RenderRequestBody>, reply: FastifyReply) => {
			const { design, options, saveMetadata } = req.body;

			const jobId = randomUUID();
			const format = getRequestedFormat(options?.format);
			const frameTimeMs = getRequestedFrameTimeMs(options?.frameTimeMs);

			const renderInput = new DesignRenderInputAdapter(design, format, frameTimeMs).build();
			const exportType: "mp4" | "webp" = format === "webp" ? "webp" : "mp4";
			const typedSaveMetadata: RenderSaveMetadata | undefined = saveMetadata;

			req.log.info({ jobId, format }, "render job accepted");

			try {
				await renderCommandPort.enqueueRender({
					jobId,
					sources: renderInput.sources,
					trimEnd: renderInput.trimEnd,
					cuts: renderInput.cuts,
					overlays: renderInput.overlays,
					audioSources: renderInput.audioSources,
					audioMixMode: renderInput.audioMixMode,
					format: renderInput.format,
					frameTimeMs: renderInput.frameTimeMs,
					cropRegion: renderInput.cropRegion,
					exportType,
					saveMetadata: typedSaveMetadata,
				});
			} catch (err) {
				if (err instanceof PublishExhaustedError) {
					throw new HttpError({
						statusCode: HttpStatus.SERVICE_UNAVAILABLE,
						message: "render queue unavailable",
						expose: true,
						cause: err,
						details: { jobId },
					});
				}
				throw err;
			}

			return reply.status(HttpStatus.ACCEPTED).send({ id: jobId });
		},
	);
};
