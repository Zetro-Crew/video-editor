import type { DesignPayload } from "@video-editor/contract/internal/render";

export interface Project {
	id: string;
	name: string;
	design: DesignPayload;
	createdAt: Date;
	updatedAt: Date;
}

export type ProjectSummary = Pick<Project, "id" | "name" | "createdAt" | "updatedAt">;
