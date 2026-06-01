import { z } from "zod";

const parsePx = (v: unknown) => {
	if (typeof v !== "string") return v;
	const n = Number.parseFloat(v);
	return Number.isFinite(n) ? n : undefined;
};
const px = z.preprocess(parsePx, z.number().default(0));
const pxOpt = z.preprocess(parsePx, z.number().optional());

const displaySchema = z.object({ from: z.number(), to: z.number() });
const trimSchema = z.object({ from: z.number(), to: z.number() });
const sizeSchema = z.object({
	width: z.number().positive(),
	height: z.number().positive(),
});

const textDetailsSchema = z
	.object({
		text: z.string().optional(),
		left: px,
		top: px,
		width: px,
		height: px,
		fontSize: pxOpt,
		color: z.string().optional(),
		backgroundColor: z.string().optional(),
		opacity: z.coerce.number().min(0).max(100).optional(),
		textAlign: z.enum(["left", "center", "right"]).optional(),
		WebkitTextStrokeWidth: pxOpt,
		WebkitTextStrokeColor: z.string().optional(),
		borderWidth: pxOpt,
		borderColor: z.string().optional(),
		transform: z.string().optional(),
		boxShadow: z.record(z.string(), z.unknown()).optional(),
	})
	.passthrough();

const videoDetailsSchema = z
	.object({
		src: z.string().optional(),
		left: px,
		top: px,
		width: px,
		height: px,
		volume: z.coerce.number().min(0).max(100).default(100),
		opacity: z.coerce.number().min(0).max(100).optional(),
		blur: pxOpt,
		brightness: pxOpt,
		borderRadius: pxOpt,
		transform: z.string().optional(),
		rotate: z.union([z.number(), z.string()]).optional(),
		crop: z.object({ x: px, y: px, width: px, height: px }).optional(),
	})
	.passthrough();

const imageDetailsSchema = z
	.object({
		src: z.string().optional(),
		left: px,
		top: px,
		width: px,
		height: px,
		opacity: z.coerce.number().min(0).max(100).optional(),
		transform: z.string().optional(),
	})
	.passthrough();

const audioDetailsSchema = z
	.object({
		src: z.string().optional(),
		volume: z.coerce.number().min(0).max(100).default(100),
	})
	.passthrough();

const captionDetailsSchema = z
	.object({
		words: z.array(z.record(z.string(), z.unknown())).optional(),
		left: px,
		top: px,
		width: px,
		height: px,
		fontSize: pxOpt,
		color: z.string().optional(),
		backgroundColor: z.string().optional(),
		opacity: z.coerce.number().min(0).max(100).optional(),
	})
	.passthrough();

const shapeDetailsSchema = z
	.object({
		src: z.string().optional(),
		left: px,
		top: px,
		width: px,
		height: px,
		backgroundColor: z.string().optional(),
		borderColor: z.string().optional(),
		borderWidth: pxOpt,
		opacity: z.coerce.number().min(0).max(100).optional(),
	})
	.passthrough();

const trackItemBaseFields = {
	id: z.string(),
	display: displaySchema,
	trim: trimSchema.optional(),
	duration: z.number().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
};

const trackItemSchema = z.discriminatedUnion("type", [
	z.object({
		...trackItemBaseFields,
		type: z.literal("text"),
		details: textDetailsSchema.optional(),
	}),
	z.object({
		...trackItemBaseFields,
		type: z.literal("video"),
		details: videoDetailsSchema.optional(),
	}),
	z.object({
		...trackItemBaseFields,
		type: z.literal("image"),
		details: imageDetailsSchema.optional(),
	}),
	z.object({
		...trackItemBaseFields,
		type: z.literal("audio"),
		details: audioDetailsSchema.optional(),
	}),
	z.object({
		...trackItemBaseFields,
		type: z.literal("caption"),
		details: captionDetailsSchema.optional(),
	}),
	z.object({
		...trackItemBaseFields,
		type: z.literal("shape"),
		details: shapeDetailsSchema.optional(),
	}),
]);

const trackSchema = z.object({
	id: z.string(),
	type: z.string(),
	items: z.array(z.string()),
	muted: z.boolean().optional(),
});

const RENDERABLE_TYPES = new Set(["text", "video", "image", "audio", "caption", "shape"]);

export const designPayloadSchema = z.object({
	id: z.union([z.string(), z.number()]),
	size: sizeSchema,
	duration: z.number().optional(),
	fps: z.number().positive(),
	tracks: z.array(trackSchema),
	trackItemIds: z.array(z.string()),
	trackItemsMap: z.preprocess(
		(val) => {
			if (typeof val !== "object" || val === null) return val;
			return Object.fromEntries(
				Object.entries(val as Record<string, unknown>).filter(([, item]) => {
					return (
						typeof item === "object" &&
						item !== null &&
						RENDERABLE_TYPES.has((item as { type?: string }).type ?? "")
					);
				}),
			);
		},
		z.record(z.string(), trackItemSchema),
	),
});

export type DesignPayload = z.infer<typeof designPayloadSchema>;
