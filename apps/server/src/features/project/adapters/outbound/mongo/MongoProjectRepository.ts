import type { Collection, Db } from "mongodb";
import type { Project, ProjectSummary } from "../../../domain/project.ts";
import type { ProjectRepository } from "../../../application/ports/outbound/ProjectRepository.ts";

interface ProjectDocument {
	_id: string;
	name: string;
	design: unknown;
	createdAt: Date;
	updatedAt: Date;
}

export class MongoProjectRepository implements ProjectRepository {
	private readonly collection: Collection<ProjectDocument>;

	constructor(db: Db) {
		this.collection = db.collection<ProjectDocument>("projects");
	}

	async save(project: Project): Promise<void> {
		await this.collection.replaceOne(
			{ _id: project.id },
			{
				name: project.name,
				design: project.design,
				createdAt: project.createdAt,
				updatedAt: project.updatedAt,
			},
			{ upsert: true },
		);
	}

	async findById(id: string): Promise<Project | null> {
		const doc = await this.collection.findOne({ _id: id });
		if (!doc) return null;
		return this.toProject(doc);
	}

	async listAll(): Promise<ProjectSummary[]> {
		const docs = await this.collection
			.find({}, { projection: { design: 0 } })
			.sort({ updatedAt: -1 })
			.toArray();
		return docs.map((doc) => ({
			id: doc._id,
			name: doc.name,
			createdAt: doc.createdAt,
			updatedAt: doc.updatedAt,
		}));
	}

	private toProject(doc: ProjectDocument): Project {
		return {
			id: doc._id,
			name: doc.name,
			design: doc.design as Project["design"],
			createdAt: doc.createdAt,
			updatedAt: doc.updatedAt,
		};
	}
}
