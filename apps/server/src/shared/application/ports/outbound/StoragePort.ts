import type { Readable } from "node:stream";

export interface PresignedUploadOptions {
	contentType?: string;
	contentLength?: number;
	expiresIn?: number;
}

export interface StoragePort {
	uploadStream(stream: Readable, key: string, contentType?: string): Promise<void>;
	downloadToFile(urlOrKey: string, outputPath: string): Promise<void>;
	getPresignedUrl(key: string, expiresIn?: number): Promise<string>;
	getPresignedUploadUrl(key: string, options?: PresignedUploadOptions): Promise<string>;
	deleteFile(key: string): Promise<void>;
	exists(key: string): Promise<boolean>;
	ensureBucketExists(): Promise<void>;
}
