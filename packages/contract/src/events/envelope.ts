import { z } from "zod";

export const X_EVENT_NAME = "x-event-name";
export const X_EVENT_VERSION = "x-event-version";

export const EXCHANGE_NAME = "video-editor";

export type Envelope<TData> = {
	eventName: string;
	eventVersion: number;
	occurredAt: string;
	traceparent?: string;
	data: TData;
};

export const envelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
	z.strictObject({
		eventName: z.string().min(1),
		eventVersion: z.number().int().positive(),
		occurredAt: z.string().min(1),
		traceparent: z.string().optional(),
		data: dataSchema,
	});
