import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const positiveNumber = z.number().finite().min(0);

export const savedMediaItemSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("image"), id: nonEmptyString }),
	z.strictObject({ type: z.literal("clip"), id: nonEmptyString }),
	z.strictObject({
		type: z.literal("recording"),
		id: nonEmptyString,
		from: positiveNumber,
		to: positiveNumber,
	}),
	z.strictObject({
		type: z.literal("audio"),
		id: nonEmptyString,
		from: positiveNumber,
		to: positiveNumber,
	}),
]);

export const savedMediaPayloadSchema = z.strictObject({
	mediaId: nonEmptyString,
	mediaName: nonEmptyString,
	downloadToComputer: z.boolean(),
	saveToPersonalChannel: z.boolean(),
	selectedUnitChannelIds: z.array(z.string()),
	exportType: z.union([z.literal("mp4"), z.literal("webp")]),
	items: z.array(savedMediaItemSchema),
});

export type SavedMediaItem = z.infer<typeof savedMediaItemSchema>;
export type SavedMediaPayload = z.infer<typeof savedMediaPayloadSchema>;
