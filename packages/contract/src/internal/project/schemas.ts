import { z } from "zod";
import { designPayloadSchema } from "../render/design-payload.schema.js";
import { errorResponseSchema } from "../shared/error-response.js";

export const saveProjectBodySchema = z.object({
	name: z.string().min(1).max(200),
	design: designPayloadSchema,
});

export const saveProjectResponseSchema = z.object({
	id: z.string(),
});

export const saveProjectSchema = {
	body: saveProjectBodySchema,
	response: {
		201: saveProjectResponseSchema,
		400: errorResponseSchema,
		500: errorResponseSchema,
	},
};

export const projectSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export const listProjectsResponseSchema = z.array(projectSummarySchema);

export const getProjectResponseSchema = z.object({
	id: z.string(),
	name: z.string(),
	design: designPayloadSchema,
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export type SaveProjectBody = z.infer<typeof saveProjectBodySchema>;
export type SaveProjectResponse = z.infer<typeof saveProjectResponseSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type GetProjectResponse = z.infer<typeof getProjectResponseSchema>;
