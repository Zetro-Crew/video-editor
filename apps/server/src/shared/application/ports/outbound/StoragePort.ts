import type { Readable } from "node:stream";

export interface StoragePort {
	uploadStream(stream: Readable, key: string, contentType?: string): Promise<void>;
	downloadToFile(urlOrKey: string, outputPath: string): Promise<void>;
	getPresignedUrl(key: string, expiresIn?: number): Promise<string>;
	getPresignedUploadUrl(key: string, contentType?: string, expiresIn?: number): Promise<string>;
	deleteFile(key: string): Promise<void>;
	ensureBucketExists(): Promise<void>;
}
