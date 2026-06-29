import type { DraftStoragePort } from "../ports/outbound/DraftStoragePort.ts";

export class LoadDraftUseCase {
	private readonly storage: DraftStoragePort;

	constructor(storage: DraftStoragePort) {
		this.storage = storage;
	}

	async execute(projectId: string): Promise<{ design: unknown; savedAt: Date } | null> {
		return this.storage.loadDraft(projectId);
	}
}
