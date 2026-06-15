import { z } from "zod";
import { errorResponseSchema } from "../shared/error-response.js";

const channelRangeSourceSchema = z.object({
	type: z.literal("channel-range"),
	channelId: z.string().min(1),
	startTimeMs: z.number(),
	endTimeMs: z.number(),
});

const mediaIdSourceSchema = z.object({
	type: z.literal("media-id"),
	mediaId: z.string().min(1),
});

export const previewSourceSchema = z.discriminatedUnion("type", [
	channelRangeSourceSchema,
	mediaIdSourceSchema,
]);

export const previewSourceBodySchema = z.object({
	source: previewSourceSchema,
});

export const previewSourceResponseSchema = z.object({
	type: z.literal("hls"),
	playlistUrl: z.string(),
	durationMs: z.number(),
	sourceOffsetMs: z.number(),
	width: z.number(),
	height: z.number(),
	mediaCreatedAtMs: z.number().optional(),
});

export const previewSourceRequestSchema = {
	body: previewSourceBodySchema,
	response: {
		200: previewSourceResponseSchema,
		400: errorResponseSchema,
		500: errorResponseSchema,
	},
};

export const segmentQuerySchema = z.object({
	url: z.string().min(1),
	token: z.string().optional(),
	sig: z.string().min(1),
	kind: z.union([z.literal("channel-range"), z.literal("media-id")]),
});

export const segmentRequestSchema = {
	querystring: segmentQuerySchema,
	response: {
		400: errorResponseSchema,
		403: errorResponseSchema,
		500: errorResponseSchema,
		502: errorResponseSchema,
		504: errorResponseSchema,
	},
};

export type PreviewSource = z.infer<typeof previewSourceSchema>;
export type PreviewSourceBody = z.infer<typeof previewSourceBodySchema>;
export type PreviewSourceResponse = z.infer<typeof previewSourceResponseSchema>;
export type SegmentQuery = z.infer<typeof segmentQuerySchema>;
