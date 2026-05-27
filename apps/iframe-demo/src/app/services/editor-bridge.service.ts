import { Injectable, signal } from "@angular/core";
import type {
	AudioRangePayload,
	EditorResponse,
	MediaPayload,
	PreviewItemPayload,
	RecordingRangePayload,
} from "../message-types";

@Injectable({ providedIn: "root" })
export class EditorBridgeService {
	private readonly queue = signal<PreviewItemPayload[]>([]);
	readonly pendingItems = this.queue.asReadonly();
	readonly lastResponse = signal<EditorResponse | null>(null);
	readonly fullMode = signal<boolean>(true);

	addMedia(payload: MediaPayload): void {
		this.queue.update((q) => [...q, payload]);
	}

	addAudio(payload: AudioRangePayload): void {
		this.queue.update((q) => [...q, payload]);
	}

	addRecordingRange(payload: RecordingRangePayload): void {
		this.queue.update((q) => [...q, payload]);
	}

	drainQueue(): PreviewItemPayload[] {
		const items = this.queue();
		this.queue.set([]);
		return items;
	}

	setLastResponse(response: EditorResponse): void {
		this.lastResponse.set(response);
	}
}
