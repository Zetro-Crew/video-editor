import type { ServerResponse } from "node:http";

export interface ExportResult {
	jobId: string;
	url: string;
	exportType: "mp4" | "webp";
	occurredAt: string;
}

export class ExportResultStore {
	private latest: ExportResult | null = null;
	private readonly subscribers = new Set<ServerResponse>();

	push(result: ExportResult): void {
		this.latest = result;
		const line = `data: ${JSON.stringify(result)}\n\n`;
		for (const res of this.subscribers) res.write(line);
	}

	getLatest(): ExportResult | null {
		return this.latest;
	}

	subscribe(res: ServerResponse): void {
		this.subscribers.add(res);
	}

	unsubscribe(res: ServerResponse): void {
		this.subscribers.delete(res);
	}
}
