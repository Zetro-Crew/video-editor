import { z } from "zod";
import { savedMediaPayloadSchema } from "../../shared/saved-media.js";

const nonEmptyString = z.string().trim().min(1);
const requestIdSchema = z.string().trim().min(1).optional();
const safeMediaUrl = (src: string) => /^https?:\/\//i.test(src);
const safeSrc = nonEmptyString.refine(safeMediaUrl, {
	message: "src must be an http/https URL",
});

export const editorPreviewItemAddedMessageSchema = z.strictObject({
	type: z.literal("EDITOR_PREVIEW_ITEM_ADDED"),
	requestId: requestIdSchema,
	itemId: nonEmptyString,
});

export const editorPreviewItemRejectedMessageSchema = z.strictObject({
	type: z.literal("EDITOR_PREVIEW_ITEM_REJECTED"),
	requestId: requestIdSchema,
	reason: nonEmptyString,
});

export const editorProjectClearedMessageSchema = z.strictObject({
	type: z.literal("EDITOR_PROJECT_CLEARED"),
	requestId: requestIdSchema,
});

export const editorReadyMessageSchema = z.strictObject({
	type: z.literal("EDITOR_READY"),
});

export const editorMediaSavedMessageSchema = z.strictObject({
	...savedMediaPayloadSchema.shape,
	type: z.literal("EDITOR_MEDIA_SAVED"),
	url: safeSrc,
});

export const editorToParentMessageSchema = z.union([
	editorPreviewItemAddedMessageSchema,
	editorPreviewItemRejectedMessageSchema,
	editorProjectClearedMessageSchema,
	editorReadyMessageSchema,
	editorMediaSavedMessageSchema,
]);

export type EditorPreviewItemAddedMessage = z.infer<typeof editorPreviewItemAddedMessageSchema>;
export type EditorPreviewItemRejectedMessage = z.infer<
	typeof editorPreviewItemRejectedMessageSchema
>;
export type EditorProjectClearedMessage = z.infer<typeof editorProjectClearedMessageSchema>;
export type EditorReadyMessage = z.infer<typeof editorReadyMessageSchema>;
export type EditorMediaSavedMessage = z.infer<typeof editorMediaSavedMessageSchema>;
export type EditorToParentMessage = z.infer<typeof editorToParentMessageSchema>;
