import { randomUUID } from "node:crypto";
import path from "node:path";
import type { StoragePort } from "../../../../shared/application/ports/outbound/StoragePort.ts";

export interface GetSignedUrlInput {
	filename: string;
	mimetype?: string;
	size: number;
}

export interface GetSignedUrlOutput {
	uploadUrl: string;
	s3Key: string;
	filename: string;
	publicUrl: string;
}

export class UploadTooLargeError extends Error {
	readonly size: number;
	readonly maxSize: number;
	constructor(size: number, maxSize: number) {
		super(`Upload size ${size} exceeds max ${maxSize}`);
		this.name = "UploadTooLargeError";
		this.size = size;
		this.maxSize = maxSize;
	}
}

export class UploadUseCase {
	private readonly storage: StoragePort;
	private readonly uploadPrefix: string;
	private readonly maxSizeBytes: number;

	constructor(storage: StoragePort, uploadPrefix: string, maxSizeBytes: number) {
		this.storage = storage;
		this.uploadPrefix = uploadPrefix;
		this.maxSizeBytes = maxSizeBytes;
	}

	async getSignedUrl(input: GetSignedUrlInput): Promise<GetSignedUrlOutput> {
		const { filename, mimetype, size } = input;
		if (size > this.maxSizeBytes) {
			throw new UploadTooLargeError(size, this.maxSizeBytes);
		}
		const ext = path.extname(filename).toLowerCase();
		const generatedFilename = `${randomUUID()}${ext}`;
		const s3Key = `${this.uploadPrefix}/${generatedFilename}`;

		const uploadUrl = await this.storage.getPresignedUploadUrl(s3Key, {
			contentType: mimetype,
			contentLength: size,
		});
		const publicUrl = await this.storage.getPresignedUrl(s3Key);

		return { uploadUrl, s3Key, filename: generatedFilename, publicUrl };
	}
}
