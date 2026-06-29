import type { MongoDbConnection } from "../../../../../infrastructure/mongodb/MongoDbConnection.ts";
import type { DraftStoragePort } from "../../../application/ports/outbound/DraftStoragePort.ts";

const COLLECTION = "drafts";

export class MongoDraftAdapter implements DraftStoragePort {
	private readonly connection: MongoDbConnection;

	constructor(connection: MongoDbConnection) {
		this.connection = connection;
	}

	async saveDraft(projectId: string, design: unknown): Promise<void> {
		await this.connection
			.getDb()
			.collection(COLLECTION)
			.updateOne(
				{ projectId },
				{ $set: { projectId, design, savedAt: new Date() } },
				{ upsert: true },
			);
	}

	async loadDraft(projectId: string): Promise<{ design: unknown; savedAt: Date } | null> {
		const doc = await this.connection.getDb().collection(COLLECTION).findOne({ projectId });
		if (!doc) return null;
		return { design: doc.design, savedAt: doc.savedAt as Date };
	}
}
