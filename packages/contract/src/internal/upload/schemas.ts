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

export const cleanupBodySchema = z.object({
	s3Keys: z.array(z.string().min(1)).min(1),
});

export const cleanupResponseSchema = z.object({
	deleted: z.number(),
	deletedFiles: z.array(z.string()),
	errors: z.array(z.string()).optional(),
});

export const cleanupRequestSchema = {
	body: cleanupBodySchema,
	response: {
		200: cleanupResponseSchema,
		400: errorResponseSchema,
		500: errorResponseSchema,
	},
};

export type GetSignedUrlRequest = z.infer<typeof getSignedUrlBodySchema>;
export type GetSignedUrlResponse = z.infer<typeof getSignedUrlResponseSchema>;
export type CleanupRequest = z.infer<typeof cleanupBodySchema>;
export type CleanupResponse = z.infer<typeof cleanupResponseSchema>;
