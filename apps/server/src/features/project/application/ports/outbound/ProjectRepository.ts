import type { Project, ProjectSummary } from "../../../domain/project.ts";

export interface ProjectRepository {
	save(project: Project): Promise<void>;
	findById(id: string): Promise<Project | null>;
	listAll(): Promise<ProjectSummary[]>;
}
