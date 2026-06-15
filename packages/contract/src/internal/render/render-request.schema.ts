import { z } from "zod";
import { savedMediaPayloadSchema } from "../../shared/saved-media.js";
import { errorResponseSchema } from "../shared/error-response.js";
import { designPayloadSchema } from "./design-payload.schema.js";

const saveMetadataSchema = savedMediaPayloadSchema.omit({ exportType: true });

const renderOptionsSchema = z
	.object({
		fps: z.number().positive().optional(),
		format: z.union([z.literal("mp4"), z.literal("webp"), z.literal("dash")]).optional(),
		size: z.unknown().optional(),
		frameTimeMs: z.number().optional(),
	})
	.optional();

export const renderRequestBodySchema = z.object({
	design: designPayloadSchema,
	options: renderOptionsSchema,
	saveMetadata: saveMetadataSchema.optional(),
});

export const renderResponseSchema = z.object({
	id: z.string(),
});

export const renderRequestSchema = {
	body: renderRequestBodySchema,
	response: {
		202: renderResponseSchema,
		400: errorResponseSchema,
		503: errorResponseSchema,
		500: errorResponseSchema,
	},
};

export type RenderRequestBody = z.infer<typeof renderRequestBodySchema>;
export type RenderResponse = z.infer<typeof renderResponseSchema>;
export type RenderSaveMetadata = z.infer<typeof saveMetadataSchema>;
