export interface DraftStoragePort {
	saveDraft(projectId: string, design: unknown): Promise<void>;
	loadDraft(projectId: string): Promise<{ design: unknown; savedAt: Date } | null>;
}
