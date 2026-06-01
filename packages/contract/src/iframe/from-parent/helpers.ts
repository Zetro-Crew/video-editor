import { type ParentToEditorMessage, parentToEditorMessageSchema } from "./schemas.js";

export const isParentToEditorMessage = (value: unknown): value is ParentToEditorMessage =>
	parentToEditorMessageSchema.safeParse(value).success;

export const parseParentToEditorMessage = (value: unknown): ParentToEditorMessage =>
	parentToEditorMessageSchema.parse(value);
