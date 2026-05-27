import path from "node:path";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { Request } from "../../../../../infrastructure/fastify/fastify.ts";
import { HttpStatus } from "../../../../../shared/utils/http-status.ts";
import type { UploadUseCase } from "../../../application/use-cases/UploadUseCase.ts";
import {
	type CleanupRequest,
	cleanupRequestSchema,
	type GetSignedUrlRequest,
	getSignedUrlRequestSchema,
} from "./upload.schema.ts";

const ALLOWED_MIMES = [
	"video/mp4",
	"video/x-m4v",
	"video/webm",
	"video/quicktime",
	"application/dash+xml",
	"audio/mpeg",
	"audio/mp3",
	"audio/mp4",
	"audio/x-m4a",
	"audio/wav",
	"audio/x-wav",
	"audio/ogg",
	"audio/aac",
	"audio/webm",
	"audio/flac",
	"audio/x-flac",
	"image/jpeg",
	"image/jpg",
	"image/png",
	"image/gif",
	"image/webp",
];

const ALLOWED_EXTENSIONS = [
	".mp4",
	".m4v",
	".webm",
	".mov",
	".mpd",
	".mp3",
	".m4a",
	".wav",
	".ogg",
	".aac",
	".flac",
	".jpg",
	".jpeg",
	".png",
	".gif",
	".webp",
];

const isAllowedUpload = (filename: string, mimetype?: string): boolean => {
	const ext = path.extname(filename).toLowerCase();
	const mimeAllowed = mimetype ? ALLOWED_MIMES.includes(mimetype) : false;
	const extAllowed = ALLOWED_EXTENSIONS.includes(ext);
	return mimeAllowed || extAllowed;
};

interface UploadControllerOptions {
	uploadUseCase: UploadUseCase;
}

export const uploadController: FastifyPluginAsync<UploadControllerOptions> = async (
	fastify,
	opts,
): Promise<void> => {
	const { uploadUseCase } = opts;

	fastify.post(
		"/upload/signed-url",
		{ schema: getSignedUrlRequestSchema },
		async (request: Request<GetSignedUrlRequest>, reply: FastifyReply) => {
			const { filename, mimetype } = request.body;
			const ext = path.extname(filename).toLowerCase();

			if (!isAllowedUpload(filename, mimetype)) {
				return reply.status(HttpStatus.BAD_REQUEST).send({
					error: `File type not allowed: ${mimetype || ext}. Allowed types: ${ALLOWED_MIMES.join(", ")}`,
				});
			}

			try {
				const result = await uploadUseCase.getSignedUrl({ filename, mimetype });
				return reply.status(HttpStatus.OK).send(result);
			} catch (err) {
				return reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
					error: err instanceof Error ? err.message : "Unknown error",
				});
			}
		},
	);

	fastify.post(
		"/cleanup",
		{ schema: cleanupRequestSchema },
		async (request: Request<CleanupRequest>, reply: FastifyReply) => {
			const { s3Keys } = request.body;

			if (!Array.isArray(s3Keys) || s3Keys.length === 0) {
				return reply.status(HttpStatus.BAD_REQUEST).send({ error: "s3Keys array is required" });
			}

			const result = await uploadUseCase.deleteFiles({ s3Keys });
			return reply.status(HttpStatus.OK).send(result);
		},
	);

	fastify.post("/uploads/file", async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const parts = request.parts();
			let fileName: string | undefined;
			let contentType: string | undefined;
			let uploadResult: Awaited<ReturnType<UploadUseCase["uploadFile"]>> | undefined;

			for await (const part of parts) {
				if (part.type === "file" && part.fieldname === "file") {
					fileName = part.filename;
					contentType = part.mimetype;

					if (!isAllowedUpload(fileName, contentType)) {
						return reply.status(HttpStatus.BAD_REQUEST).send({
							error: `File type not allowed: ${contentType || path.extname(fileName).toLowerCase()}. Allowed types: ${ALLOWED_MIMES.join(", ")}`,
						});
					}

					uploadResult = await uploadUseCase.uploadFile({
						filename: fileName,
						mimetype: contentType,
						stream: part.file,
					});
				} else if (part.type === "field") {
					void part.value;
				}
			}

			if (!fileName || !contentType) {
				return reply.status(HttpStatus.BAD_REQUEST).send({ error: "file field is required" });
			}
			if (!uploadResult) {
				return reply
					.status(HttpStatus.INTERNAL_SERVER_ERROR)
					.send({ error: "Upload failed: no result returned" });
			}

			return reply.status(HttpStatus.OK).send({
				success: true,
				upload: { ...uploadResult, folder: null },
			});
		} catch (err) {
			return reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
				error: err instanceof Error ? err.message : "Unknown error",
			});
		}
	});
};
