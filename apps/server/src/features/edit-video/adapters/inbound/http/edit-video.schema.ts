import { z } from "zod";
import { OverlayType } from "../../../../../shared/domain/OverlayType.ts";

export const textOverlaySchema = z.object({
	id: z.uuid(),
	type: z.literal(OverlayType.text),
	text: z.string(),
	start: z.number().min(0),
	end: z.number().positive(),
	trackOrder: z.number().optional(),
	x: z.number().min(0).max(100),
	y: z.number().min(0).max(100),
	fontSize: z.number().positive().optional(),
	canvasHeight: z.number().min(1).optional(),
	canvasWidth: z.number().min(1).optional(),
	elementWidth: z.number().min(1).optional(),
	elementHeight: z.number().min(1).optional(),
	textAlign: z.union([z.literal("left"), z.literal("center"), z.literal("right")]).optional(),
	fontColor: z.string().optional(),
	backgroundColor: z.string().optional(),
	strokeWidth: z.number().min(0).optional(),
	strokeColor: z.string().optional(),
	opacity: z.number().min(0).max(1).optional(),
});

export const imageOverlaySchema = z.object({
	id: z.uuid(),
	type: z.literal(OverlayType.image),
	imageUrl: z.string().url(),
	start: z.number().min(0),
	end: z.number().positive(),
	trackOrder: z.number().optional(),
	x: z.number().min(0).max(100),
	y: z.number().min(0).max(100),
	width: z.number().min(1).max(10000).optional(),
	height: z.number().min(1).max(10000).optional(),
	opacity: z.number().min(0).max(1).optional(),
});

export const videoOverlaySchema = z.object({
	id: z.uuid(),
	type: z.literal(OverlayType.video),
	sourceUrl: z.string().url(),
	start: z.number().min(0),
	end: z.number().positive(),
	trackOrder: z.number(),
	left: z.number(),
	top: z.number(),
	width: z.number().min(1).max(10000).optional(),
	height: z.number().min(1).max(10000).optional(),
	opacity: z.number().min(0).max(1).optional(),
	transform: z.string().optional(),
	trimFrom: z.number().min(0).optional(),
	trimTo: z.number().positive().optional(),
	crop: z
		.object({
			x: z.number().min(0),
			y: z.number().min(0),
			width: z.number().min(1),
			height: z.number().min(1),
		})
		.optional(),
	blur: z.number().min(0).optional(),
	brightness: z.number().positive().optional(),
	borderRadius: z.number().min(0).optional(),
	rotation: z.number().optional(),
});

export const rectangleOverlaySchema = z.object({
	id: z.uuid(),
	type: z.literal(OverlayType.rectangle),
	start: z.number().min(0),
	end: z.number().positive(),
	trackOrder: z.number().optional(),
	x: z.number().min(0).max(100),
	y: z.number().min(0).max(100),
	width: z.number().min(1).max(10000).optional(),
	height: z.number().min(1).max(10000).optional(),
	color: z.string().optional(),
	strokeWidth: z.number().min(1).max(20).optional(),
	fill: z.boolean().optional(),
	opacity: z.number().min(0).max(1).optional(),
});

export const circleOverlaySchema = z.object({
	id: z.uuid(),
	type: z.literal(OverlayType.circle),
	start: z.number().min(0),
	end: z.number().positive(),
	trackOrder: z.number().optional(),
	x: z.number().min(0).max(100),
	y: z.number().min(0).max(100),
	width: z.number().min(1).max(10000).optional(),
	height: z.number().min(1).max(10000).optional(),
	color: z.string().optional(),
	strokeWidth: z.number().min(1).max(20).optional(),
	fill: z.boolean().optional(),
	opacity: z.number().min(0).max(1).optional(),
});

export const shapeOverlaySchema = z.object({
	id: z.uuid(),
	type: z.literal(OverlayType.shape),
	svgData: z.string().min(1),
	start: z.number().min(0),
	end: z.number().positive(),
	trackOrder: z.number().optional(),
	x: z.number(),
	y: z.number(),
	width: z.number().min(1).max(10000).optional(),
	height: z.number().min(1).max(10000).optional(),
	opacity: z.number().min(0).max(1).optional(),
	backgroundColor: z.string().optional(),
	borderColor: z.string().optional(),
	borderWidth: z.number().min(0).optional(),
});

export const overlaySchema = z.union([
	textOverlaySchema,
	imageOverlaySchema,
	videoOverlaySchema,
	rectangleOverlaySchema,
	circleOverlaySchema,
	shapeOverlaySchema,
]);

export const sourceSchema = z.object({
	url: z.url(),
	type: z.union([z.literal("video"), z.literal("image")]),
	duration: z.number().min(0.1).default(5),
	trimFrom: z.number().min(0).optional(),
	trimTo: z.number().positive().optional(),
});

export const audioSourceSchema = z.object({
	url: z.url(),
	startTime: z.number().min(0),
	duration: z.number().positive(),
	originalDuration: z.number().positive().optional(),
	audioTrimStart: z.number().min(0).optional(),
	audioTrimEnd: z.number().positive().optional(),
	sourceType: z.union([z.literal("audio"), z.literal("video")]).optional(),
	volume: z.number().min(0).max(1),
	muted: z.boolean().optional(),
	solo: z.boolean().optional(),
});

const cutSchema = z.object({
	start: z.number().min(0),
	end: z.number().positive(),
});

export const editVideoRequestSchema = z.object({
	sources: z.array(sourceSchema).min(1),
	sourceUrl: z.url().optional(),
	trimEnd: z.number().positive(),
	cuts: z.array(cutSchema).default([]),
	overlays: z.array(overlaySchema).default([]),
	audioSources: z.array(audioSourceSchema).default([]),
	audioMixMode: z.union([z.literal("mix"), z.literal("replace")]).default("mix"),
	format: z.union([z.literal("mp4"), z.literal("webp"), z.literal("dash")]).default("mp4"),
	frameTimeMs: z.number().optional(),
	jobId: z.string(),
	cropRegion: z
		.object({
			x: z.number().min(0),
			y: z.number().min(0),
			width: z.number().min(2),
			height: z.number().min(2),
		})
		.optional(),
});
