import { z } from "zod";
import { errorResponseSchema } from "../shared/error-response.js";

export const getSignedUrlBodySchema = z.object({
	filename: z.string().min(1),
	mimetype: z.string().min(1),
	// Required for size enforcement: server signs Content-Length into the
	// presigned PUT so S3 rejects payloads that don't match.
	size: z.number().int().positive(),
});

export const getSignedUrlResponseSchema = z.object({
	uploadUrl: z.string(),
	s3Key: z.string(),
	filename: z.string(),
	publicUrl: z.string(),
});

export const getSignedUrlRequestSchema = {
	body: getSignedUrlBodySchema,
	response: {
		200: getSignedUrlResponseSchema,
		400: errorResponseSchema,
		413: errorResponseSchema,
		500: errorResponseSchema,
	},
};

export type GetSignedUrlRequest = z.infer<typeof getSignedUrlBodySchema>;
export type GetSignedUrlResponse = z.infer<typeof getSignedUrlResponseSchema>;
