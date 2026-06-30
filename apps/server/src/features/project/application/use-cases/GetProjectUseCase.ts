import type { Project } from "../../domain/project.ts";
import type { ProjectRepository } from "../ports/outbound/ProjectRepository.ts";

export class ProjectNotFoundError extends Error {
	constructor(id: string) {
		super(`Project not found: ${id}`);
		this.name = "ProjectNotFoundError";
	}
}

export class GetProjectUseCase {
	private readonly repo: ProjectRepository;
	constructor(repo: ProjectRepository) {
		this.repo = repo;
	}

	async execute(id: string): Promise<Project> {
		const project = await this.repo.findById(id);
		if (!project) throw new ProjectNotFoundError(id);
		return project;
	}
}
