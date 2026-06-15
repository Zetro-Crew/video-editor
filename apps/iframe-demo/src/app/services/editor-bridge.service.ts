import { Injectable, signal } from "@angular/core";
import type {
	AudioRangePayload,
	EditorResponse,
	PreviewItemPayload,
	RecordingRangePayload,
} from "../message-types";

type StoredMediaRequest = { kind: "stored-media"; mediaId: string };
export type BridgeQueueItem = PreviewItemPayload | StoredMediaRequest;

@Injectable({ providedIn: "root" })
export class EditorBridgeService {
	private readonly queue = signal<BridgeQueueItem[]>([]);
	readonly pendingItems = this.queue.asReadonly();
	readonly lastResponse = signal<EditorResponse | null>(null);
	readonly fullMode = signal<boolean>(true);

	addStoredMedia(mediaId: string): void {
		this.queue.update((q) => [...q, { kind: "stored-media", mediaId }]);
	}

	addAudio(payload: AudioRangePayload): void {
		this.queue.update((q) => [...q, payload]);
	}

	addRecordingRange(payload: RecordingRangePayload): void {
		this.queue.update((q) => [...q, payload]);
	}

	drainQueue(): BridgeQueueItem[] {
		const items = this.queue();
		this.queue.set([]);
		return items;
	}

	setLastResponse(response: EditorResponse): void {
		this.lastResponse.set(response);
	}
}
