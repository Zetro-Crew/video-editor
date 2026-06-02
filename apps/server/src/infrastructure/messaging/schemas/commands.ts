import { envelopeSchema, savedMediaItemSchema } from "@video-editor/contract/events";
import {
	audioSourceSchema,
	overlaySchema,
	sourceSchema as videoSourceSchema,
} from "@video-editor/contract/internal/edit-video";
import { z } from "zod";

export const COMMANDS_EXCHANGE = "video-editor.commands";
export const DLX_EXCHANGE = "video-editor.commands.dlx";
export const RENDER_REQUESTED_QUEUE = "render.requested";
export const RENDER_DEAD_QUEUE = "render.dead";

export const RENDER_REQUESTED = "render.requested";
export const RENDER_REQUESTED_V1 = 1;

const nonEmptyString = z.string().trim().min(1);
// jobId is interpolated into S3 keys (output paths) — restrict to a safe
// character set to block path traversal and other key-injection.
const jobIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, "invalid jobId");

const timeRangeSchema = z.object({
	start: z.number(),
	end: z.number(),
});

const cropRegionSchema = z.object({
	x: z.number(),
	y: z.number(),
	width: z.number(),
	height: z.number(),
});

const renderRequestedDataSchema = z.object({
	jobId: jobIdSchema,
	sources: z.array(videoSourceSchema),
	trimEnd: z.number(),
	cuts: z.array(timeRangeSchema),
	overlays: z.array(overlaySchema),
	audioSources: z.array(audioSourceSchema),
	audioMixMode: z.union([z.literal("mix"), z.literal("replace")]),
	format: z.union([z.literal("mp4"), z.literal("webp"), z.literal("dash")]),
	frameTimeMs: z.number().optional(),
	cropRegion: cropRegionSchema.optional(),
	exportType: z.union([z.literal("mp4"), z.literal("webp")]),
	saveMetadata: z
		.object({
			mediaId: nonEmptyString,
			mediaName: nonEmptyString,
			downloadToComputer: z.boolean(),
			saveToPersonalChannel: z.boolean(),
			selectedUnitChannelIds: z.array(z.string()),
			items: z.array(savedMediaItemSchema),
		})
		.optional(),
});

export const renderRequestedEnvelopeSchema = envelopeSchema(renderRequestedDataSchema);

export type RenderRequestedData = z.infer<typeof renderRequestedDataSchema>;
