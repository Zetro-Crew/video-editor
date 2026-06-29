import type { IDesign } from "@designcombo/types";

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

type DraftEntry = { savedAt: number; design: IDesign };

function getSessionKey(): string {
	return new URLSearchParams(window.location.search).get("sessionKey") ?? "default";
}

function getDraftKey(): string {
	return `editor-draft:${getSessionKey()}`;
}

export function saveDraft(design: IDesign): void {
	try {
		const entry: DraftEntry = { savedAt: Date.now(), design };
		localStorage.setItem(getDraftKey(), JSON.stringify(entry));
	} catch (err) {
		console.warn("[draft] Failed to save draft to localStorage:", err);
	}
}

export function loadDraft(): IDesign | null {
	try {
		const raw = localStorage.getItem(getDraftKey());
		if (!raw) return null;

		const entry = JSON.parse(raw) as DraftEntry;
		if (Date.now() - entry.savedAt > DRAFT_TTL_MS) {
			clearDraft();
			return null;
		}
		return entry.design;
	} catch {
		clearDraft();
		return null;
	}
}

export function clearDraft(): void {
	localStorage.removeItem(getDraftKey());
}
