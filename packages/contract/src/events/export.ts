import { z } from "zod";
import type { SavedMediaItem } from "../shared/saved-media.js";
import { savedMediaItemSchema } from "../shared/saved-media.js";
import { type Envelope, envelopeSchema } from "./envelope.js";

export const EXPORT_STARTED = "export.started";
export const EXPORT_COMPLETED = "export.completed";
export const EXPORT_FAILED = "export.failed";

export const EXPORT_STARTED_V1 = 1;
export const EXPORT_COMPLETED_V1 = 1;
export const EXPORT_FAILED_V1 = 1;

const nonEmptyString = z.string().trim().min(1);
const httpUrl = nonEmptyString.refine((v) => /^https?:\/\//i.test(v), {
	message: "url must be an http/https URL",
});

export const exportStartedDataSchema = z.strictObject({
	jobId: nonEmptyString,
	mediaId: nonEmptyString,
	mediaName: nonEmptyString,
	downloadToComputer: z.boolean(),
	saveToPersonalChannel: z.boolean(),
	selectedUnitChannelIds: z.array(z.string()),
	exportType: z.union([z.literal("mp4"), z.literal("webp")]),
	items: z.array(savedMediaItemSchema),
});

export const exportCompletedDataSchema = z.strictObject({
	jobId: nonEmptyString,
	url: httpUrl,
	exportType: z.union([z.literal("mp4"), z.literal("webp")]),
});

export const exportFailedDataSchema = z.strictObject({
	jobId: nonEmptyString,
	error: nonEmptyString,
});

export type ExportStartedData = {
	jobId: string;
	mediaId: string;
	mediaName: string;
	downloadToComputer: boolean;
	saveToPersonalChannel: boolean;
	selectedUnitChannelIds: string[];
	exportType: "mp4" | "webp";
	items: SavedMediaItem[];
};

export type ExportCompletedData = {
	jobId: string;
	url: string;
	exportType: "mp4" | "webp";
};

export type ExportFailedData = {
	jobId: string;
	error: string;
};

export type ExportStartedEnvelope = Envelope<ExportStartedData>;
export type ExportCompletedEnvelope = Envelope<ExportCompletedData>;
export type ExportFailedEnvelope = Envelope<ExportFailedData>;

export const exportStartedEnvelopeSchema = envelopeSchema(exportStartedDataSchema);
export const exportCompletedEnvelopeSchema = envelopeSchema(exportCompletedDataSchema);
export const exportFailedEnvelopeSchema = envelopeSchema(exportFailedDataSchema);
