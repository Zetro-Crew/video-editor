import type { DraftStoragePort } from "../ports/outbound/DraftStoragePort.ts";

export class SaveDraftUseCase {
	private readonly storage: DraftStoragePort;

	constructor(storage: DraftStoragePort) {
		this.storage = storage;
	}

	async execute(projectId: string, design: unknown): Promise<void> {
		await this.storage.saveDraft(projectId, design);
	}
}
