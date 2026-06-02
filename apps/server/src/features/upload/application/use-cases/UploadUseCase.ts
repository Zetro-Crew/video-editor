import { randomUUID } from "node:crypto";
import path from "node:path";
import type { StoragePort } from "../../../../shared/application/ports/outbound/StoragePort.ts";

export interface GetSignedUrlInput {
	filename: string;
	mimetype?: string;
}

export interface GetSignedUrlOutput {
	uploadUrl: string;
	s3Key: string;
	filename: string;
	publicUrl: string;
}

export class UploadUseCase {
	private readonly storage: StoragePort;
	private readonly uploadPrefix: string;

	constructor(storage: StoragePort, uploadPrefix: string) {
		this.storage = storage;
		this.uploadPrefix = uploadPrefix;
	}

	async getSignedUrl(input: GetSignedUrlInput): Promise<GetSignedUrlOutput> {
		const { filename, mimetype } = input;
		const ext = path.extname(filename).toLowerCase();
		const generatedFilename = `${randomUUID()}${ext}`;
		const s3Key = `${this.uploadPrefix}/${generatedFilename}`;

		const uploadUrl = await this.storage.getPresignedUploadUrl(s3Key, mimetype);
		const publicUrl = await this.storage.getPresignedUrl(s3Key);

		return { uploadUrl, s3Key, filename: generatedFilename, publicUrl };
	}
}
