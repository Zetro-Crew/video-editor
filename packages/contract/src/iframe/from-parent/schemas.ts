import { z } from "zod";

export const MAX_PREVIEW_DURATION_MS = 1000 * 60 * 60 * 1;

const positiveNumber = z.number().finite().min(0);
const positiveDuration = z.number().finite().positive();
const nonEmptyString = z.string().trim().min(1);
const requestIdSchema = z.string().trim().min(1).optional();

const safeMediaUrl = (src: string) => /^https?:\/\//i.test(src);
const likelyAudioSrc = (src: string) => /\.(m3u8|mp3|wav|m4a|aac|ogg)(\?|$)/i.test(src);
const safeSrc = nonEmptyString.refine(safeMediaUrl, {
	message: "src must be an http/https URL",
});

export const hlsPlaybackSchema = z.strictObject({
	kind: z.literal("hls"),
	src: safeSrc,
});

export const mediaPlaybackSchema = z.strictObject({
	kind: z.union([z.literal("mp4"), z.literal("hls")]),
	src: safeSrc,
});

export const audioPlaybackSchema = z.strictObject({
	kind: z.union([z.literal("audio"), z.literal("hls")]),
	src: safeSrc,
});

export const playbackSchema = z.union([
	hlsPlaybackSchema,
	mediaPlaybackSchema,
	audioPlaybackSchema,
]);

export const recordingRangePayloadSchema = z
	.strictObject({
		kind: z.literal("recording-range"),
		channelId: nonEmptyString,
		startTimeMs: positiveNumber,
		endTimeMs: positiveNumber,
		durationMs: positiveDuration,
		/** When absent, the editor resolves the HLS playlist URL via POST /api/editor/preview-source. */
		playback: hlsPlaybackSchema.optional(),
		sourceOffsetMs: positiveNumber.optional(),
		posterSrc: nonEmptyString.optional(),
		name: z.string().optional(),
	})
	.superRefine((value, ctx) => {
		if (value.endTimeMs <= value.startTimeMs) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "endTimeMs must be greater than startTimeMs",
				path: ["endTimeMs"],
			});
		}

		if (value.sourceOffsetMs !== undefined && value.sourceOffsetMs > value.durationMs) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "sourceOffsetMs must be less than or equal to durationMs",
				path: ["sourceOffsetMs"],
			});
		}
	})
	.refine((p) => p.durationMs <= MAX_PREVIEW_DURATION_MS, {
		message: "durationMs exceeds the maximum supported preview duration",
		path: ["durationMs"],
	});

export const mediaPayloadSchema = z
	.strictObject({
		kind: z.literal("media"),
		mediaId: nonEmptyString,
		durationMs: positiveNumber.optional(),
		playback: mediaPlaybackSchema,
		posterSrc: nonEmptyString.optional(),
		name: z.string().optional(),
	})
	.refine((p) => (p.durationMs ?? 0) <= MAX_PREVIEW_DURATION_MS, {
		message: "durationMs exceeds the maximum supported preview duration",
		path: ["durationMs"],
	});

export const audioRangePayloadSchema = z
	.strictObject({
		kind: z.literal("audio-range"),
		audioId: nonEmptyString,
		startTimeMs: positiveNumber.optional(),
		endTimeMs: positiveNumber.optional(),
		durationMs: positiveDuration,
		playback: audioPlaybackSchema,
		sourceOffsetMs: positiveNumber.optional(),
		name: z.string().optional(),
	})
	.superRefine((value, ctx) => {
		if (
			value.startTimeMs !== undefined &&
			value.endTimeMs !== undefined &&
			value.endTimeMs <= value.startTimeMs
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "endTimeMs must be greater than startTimeMs",
				path: ["endTimeMs"],
			});
		}

		if (value.sourceOffsetMs !== undefined && value.sourceOffsetMs > value.durationMs) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "sourceOffsetMs must be less than or equal to durationMs",
				path: ["sourceOffsetMs"],
			});
		}

		if (value.playback.kind !== "hls" && !likelyAudioSrc(value.playback.src)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "audio-range src must point to audio or HLS media",
				path: ["playback", "src"],
			});
		}
	})
	.refine((p) => p.durationMs <= MAX_PREVIEW_DURATION_MS, {
		message: "durationMs exceeds the maximum supported preview duration",
		path: ["durationMs"],
	});

export const previewItemPayloadSchema = z.union([
	recordingRangePayloadSchema,
	mediaPayloadSchema,
	audioRangePayloadSchema,
]);

export const editorAddPreviewItemMessageSchema = z.strictObject({
	type: z.literal("EDITOR_ADD_PREVIEW_ITEM"),
	requestId: requestIdSchema,
	payload: previewItemPayloadSchema,
});

export const editorClearProjectMessageSchema = z.strictObject({
	type: z.literal("EDITOR_CLEAR_PROJECT"),
	requestId: requestIdSchema,
});

export const parentToEditorMessageSchema = z.union([
	editorAddPreviewItemMessageSchema,
	editorClearProjectMessageSchema,
]);

export type HlsPlayback = z.infer<typeof hlsPlaybackSchema>;
export type MediaPlayback = z.infer<typeof mediaPlaybackSchema>;
export type AudioPlayback = z.infer<typeof audioPlaybackSchema>;
export type Playback = z.infer<typeof playbackSchema>;
export type RecordingRangePayload = z.infer<typeof recordingRangePayloadSchema>;
export type MediaPayload = z.infer<typeof mediaPayloadSchema>;
export type AudioRangePayload = z.infer<typeof audioRangePayloadSchema>;
export type PreviewItemPayload = z.infer<typeof previewItemPayloadSchema>;
export type EditorAddPreviewItemMessage = z.infer<typeof editorAddPreviewItemMessageSchema>;
export type EditorClearProjectMessage = z.infer<typeof editorClearProjectMessageSchema>;
export type ParentToEditorMessage = z.infer<typeof parentToEditorMessageSchema>;
