import type { Readable } from "node:stream";
import type { StoragePort } from "../../../shared/application/ports/outbound/StoragePort.ts";

export class InMemoryStorageAdapter implements StoragePort {
	readonly objects = new Map<string, { body: Buffer; contentType?: string }>();

	async uploadStream(stream: Readable, key: string, contentType?: string): Promise<void> {
		const chunks: Buffer[] = [];
		for await (const chunk of stream) {
			chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
		}
		this.objects.set(key, { body: Buffer.concat(chunks), contentType });
	}

	async downloadToFile(): Promise<void> {
		throw new Error("downloadToFile not implemented in InMemoryStorageAdapter");
	}

	async getPresignedUrl(key: string): Promise<string> {
		return `internal://${key}`;
	}

	async getPresignedUploadUrl(_key: string): Promise<string> {
		throw new Error("getPresignedUploadUrl not implemented in InMemoryStorageAdapter");
	}

	async deleteFile(key: string): Promise<void> {
		this.objects.delete(key);
	}

	async exists(key: string): Promise<boolean> {
		return this.objects.has(key);
	}

	async ensureBucketExists(): Promise<void> {
		// no-op
	}

	read(key: string): Buffer | undefined {
		return this.objects.get(key)?.body;
	}

	readText(key: string): string | undefined {
		const obj = this.objects.get(key);
		return obj ? obj.body.toString("utf8") : undefined;
	}
}
