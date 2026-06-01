import type { VideoSource } from "@video-editor/contract/internal/edit-video";
import type {
	CutRange,
	DirectSource,
	EditorExportBody,
} from "@video-editor/contract/internal/editor-export";
import type { FastifyPluginAsync } from "fastify";
import { HttpStatus } from "../../../../../shared/utils/http-status.ts";
import type {
	VideoRenderInput,
	VideoRenderUseCase,
} from "../../../../render/application/use-cases/VideoRenderUseCase.ts";

interface EditorExportControllerOptions {
	videoRenderUseCase: VideoRenderUseCase;
	s3OutputPrefix: string;
}

function translateExportToRenderJob(
	source: DirectSource,
	cuts: CutRange[],
	format: "mp4" | "dash",
): VideoRenderInput {
	const { url, duration, trimFrom, trimTo } = source;
	const videoSource: VideoSource = {
		url,
		type: "video",
		duration,
		trimFrom,
		trimTo,
	};
	return {
		sources: [videoSource],
		trimEnd: trimTo ?? duration,
		cuts,
		overlays: [],
		audioSources: [],
		audioMixMode: "mix",
		format,
	};
}

export const editorExportController: FastifyPluginAsync<EditorExportControllerOptions> = async (
	fastify,
	opts,
): Promise<void> => {
	const { videoRenderUseCase, s3OutputPrefix } = opts;

	fastify.post<{ Body: EditorExportBody }>("/editor/export", async (request, reply) => {
		const { source, edits = {}, output = {} } = request.body;
		const format = output.format ?? "mp4";

		if (source.type === "channel-range") {
			return reply.status(HttpStatus.BAD_REQUEST).send({
				error:
					"channel-range source requires a pre-resolved HLS src. Use POST /api/editor/preview-source first to get the HLS playlistUrl, then submit as a direct source.",
			});
		}

		const cuts: CutRange[] = edits.cuts ?? [];
		const timestamp = Date.now();
		const s3Key = `${s3OutputPrefix}/${timestamp}/rendered.${format === "dash" ? "mpd" : "mp4"}`;

		try {
			const renderInput = translateExportToRenderJob(source, cuts, format);
			const result = await videoRenderUseCase.execute(renderInput, s3Key);
			return reply.status(HttpStatus.OK).send({
				url: result.url,
				s3Key: result.s3Key,
				format,
			});
		} catch (err) {
			if (err instanceof RangeError) {
				return reply.status(HttpStatus.BAD_REQUEST).send({ error: err.message });
			}
			throw err;
		}
	});
};
