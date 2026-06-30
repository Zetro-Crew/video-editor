import { randomUUID } from "node:crypto";
import type { DesignPayload } from "@video-editor/contract/internal/render";
import type { ProjectRepository } from "../ports/outbound/ProjectRepository.ts";

export interface SaveProjectInput {
	name: string;
	design: DesignPayload;
}

export interface SaveProjectOutput {
	id: string;
}

export class SaveProjectUseCase {
	private readonly repo: ProjectRepository;
	constructor(repo: ProjectRepository) {
		this.repo = repo;
	}

	async execute(input: SaveProjectInput): Promise<SaveProjectOutput> {
		const now = new Date();
		const id = randomUUID();

		await this.repo.save({
			id,
			name: input.name,
			design: input.design,
			createdAt: now,
			updatedAt: now,
		});

		return { id };
	}
}
