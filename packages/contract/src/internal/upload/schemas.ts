import { z } from "zod";

const errorResponseSchema = z.object({
	error: z.string(),
});

export const getSignedUrlBodySchema = z.object({
	filename: z.string().min(1),
	mimetype: z.string().min(1),
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
		500: errorResponseSchema,
	},
};

export type GetSignedUrlRequest = z.infer<typeof getSignedUrlBodySchema>;
export type GetSignedUrlResponse = z.infer<typeof getSignedUrlResponseSchema>;
