import type { ProjectSummary } from "../../domain/project.ts";
import type { ProjectRepository } from "../ports/outbound/ProjectRepository.ts";

export class ListProjectsUseCase {
	private readonly repo: ProjectRepository;
	constructor(repo: ProjectRepository) {
		this.repo = repo;
	}

	async execute(): Promise<ProjectSummary[]> {
		return this.repo.listAll();
	}
}
