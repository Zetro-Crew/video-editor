import type { ITrackItem } from "@designcombo/types";
import type { SavedMediaItem } from "@video-editor/contract/iframe/to-parent";
import type { ExternalMetadata } from "../external-preview/payload-intake";

export function extractSavedItems(trackItemsMap: Record<string, ITrackItem>): SavedMediaItem[] {
	const items = Object.values(trackItemsMap);
	const result: SavedMediaItem[] = [];

	// Images — one entry per item, no timeranges
	for (const item of items) {
		if (item.type === "image") {
			result.push({ type: "image", id: item.id });
		}
	}

	// Audio — group by audioId, collapse timerange
	const audioGroups = new Map<string, { from: number; to: number }>();
	for (const item of items) {
		if (item.type !== "audio") continue;
		const meta = item.metadata as ExternalMetadata | undefined;
		const key = meta?.audioId || item.id;
		const from = item.display?.from ?? 0;
		const to = item.display?.to ?? 0;
		const existing = audioGroups.get(key);
		if (existing) {
			existing.from = Math.min(existing.from, from);
			existing.to = Math.max(existing.to, to);
		} else {
			audioGroups.set(key, { from, to });
		}
	}
	for (const [id, range] of audioGroups) {
		result.push({ type: "audio", id, from: range.from, to: range.to });
	}

	// Video — split into recording-range vs clip
	const recordingGroups = new Map<string, { from: number; to: number }>();
	const clipGroups = new Map<string, true>();
	for (const item of items) {
		if (item.type !== "video") continue;
		const meta = item.metadata as ExternalMetadata | undefined;
		if (meta?.externalKind === "recording-range") {
			const key = meta.channelId || item.id;
			const from = item.display?.from ?? 0;
			const to = item.display?.to ?? 0;
			const existing = recordingGroups.get(key);
			if (existing) {
				existing.from = Math.min(existing.from, from);
				existing.to = Math.max(existing.to, to);
			} else {
				recordingGroups.set(key, { from, to });
			}
		} else {
			const key = meta?.mediaId || item.id;
			clipGroups.set(key, true);
		}
	}
	for (const [id, range] of recordingGroups) {
		result.push({ type: "recording", id, from: range.from, to: range.to });
	}
	for (const id of clipGroups.keys()) {
		result.push({ type: "clip", id });
	}

	return result;
}
