import { randomUUID } from "node:crypto";
import { savedMediaPayloadSchema } from "@video-editor/contract/events";
import type { RenderRequest } from "@video-editor/contract/internal/edit-video";
import { designPayloadSchema } from "@video-editor/contract/internal/render";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import { PublishExhaustedError } from "../../../../../infrastructure/messaging/RabbitMQPublisher.ts";
import { HttpStatus } from "../../../../../shared/utils/http-status.ts";
import type { RenderCommandPort } from "../../../application/ports/outbound/RenderCommandPort.ts";
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

const getRequestedFormat = (format?: string): RenderRequest["format"] => {
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
		const exportType: "mp4" | "webp" = format === "webp" ? "webp" : "mp4";

		let saveMetadata: SaveMetadata | undefined;
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
			saveMetadata = saveMetadataParse.data;
		}

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
				saveMetadata,
			});
		} catch (err) {
			if (err instanceof PublishExhaustedError) {
				req.log.error({ jobId, err }, "[render] enqueue failed — broker unavailable");
				return reply
					.status(HttpStatus.SERVICE_UNAVAILABLE)
					.send({ error: "render queue unavailable" });
			}
			throw err;
		}

		return reply.status(HttpStatus.ACCEPTED).send({ id: jobId });
	});
};
