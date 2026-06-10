import path from "node:path";
import {
	type GetSignedUrlRequest,
	getSignedUrlRequestSchema,
} from "@video-editor/contract/internal/upload";
import { HttpError } from "@ztube/observability/fastify";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { Request } from "../../../../../infrastructure/fastify/fastify.ts";
import { HttpStatus } from "../../../../../shared/utils/http-status.ts";
import {
	UploadTooLargeError,
	type UploadUseCase,
} from "../../../application/use-cases/UploadUseCase.ts";

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
			const { filename, mimetype, size } = request.body;
			const ext = path.extname(filename).toLowerCase();

			if (!isAllowedUpload(filename, mimetype)) {
				throw new HttpError({
					statusCode: HttpStatus.BAD_REQUEST,
					message: `File type not allowed: ${mimetype || ext}. Allowed types: ${ALLOWED_MIMES.join(", ")}`,
				});
			}

			try {
				const result = await uploadUseCase.getSignedUrl({ filename, mimetype, size });
				return reply.status(HttpStatus.OK).send(result);
			} catch (err) {
				if (err instanceof UploadTooLargeError) {
					throw new HttpError({
						statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
						message: `Upload size ${err.size} exceeds max ${err.maxSize}`,
						cause: err,
						details: { size: err.size, maxSize: err.maxSize },
					});
				}
				throw err;
			}
		},
	);
};
