import type { z } from "zod";
import type {
	audioSourceSchema,
	circleOverlaySchema,
	editVideoRequestSchema,
	imageOverlaySchema,
	overlaySchema,
	rectangleOverlaySchema,
	shapeOverlaySchema,
	sourceSchema,
	textOverlaySchema,
	videoOverlaySchema,
} from "./edit-video.schema.ts";

export type TextOverlay = z.infer<typeof textOverlaySchema>;
export type ImageOverlay = z.infer<typeof imageOverlaySchema>;
export type VideoOverlay = z.infer<typeof videoOverlaySchema>;
export type RectangleOverlay = z.infer<typeof rectangleOverlaySchema>;
export type CircleOverlay = z.infer<typeof circleOverlaySchema>;
export type ShapeOverlay = z.infer<typeof shapeOverlaySchema>;
export type Overlay = z.infer<typeof overlaySchema>;
export type VideoSource = z.infer<typeof sourceSchema>;
export type AudioSource = z.infer<typeof audioSourceSchema>;
export type RenderRequest = z.infer<typeof editVideoRequestSchema>;
