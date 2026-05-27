import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Readable } from "node:stream";
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

export interface UploadFileInput {
	filename: string;
	mimetype: string;
	stream: Readable;
}

export interface UploadFileOutput {
	fileName: string;
	filePath: string;
	contentType: string;
	url: string;
}

export interface DeleteFilesInput {
	s3Keys: string[];
}

export interface DeleteFilesOutput {
	deleted: number;
	deletedFiles: string[];
	errors?: string[];
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

	async uploadFile(input: UploadFileInput): Promise<UploadFileOutput> {
		const { filename, mimetype, stream } = input;
		const ext = path.extname(filename).toLowerCase();
		const generatedName = `${randomUUID()}${ext}`;
		const s3Key = `${this.uploadPrefix}/${generatedName}`;

		await this.storage.uploadStream(stream, s3Key, mimetype);
		const url = await this.storage.getPresignedUrl(s3Key);

		return { fileName: filename, filePath: s3Key, contentType: mimetype, url };
	}

	async deleteFiles(input: DeleteFilesInput): Promise<DeleteFilesOutput> {
		const results = await Promise.all(
			input.s3Keys.map(async (s3Key) => {
				try {
					await this.storage.deleteFile(s3Key);
					return { s3Key, ok: true } as const;
				} catch (err) {
					return {
						s3Key,
						ok: false,
						error: `Failed to delete S3 file ${s3Key}: ${err instanceof Error ? err.message : "Unknown error"}`,
					} as const;
				}
			}),
		);

		const deletedFiles = results.filter((r) => r.ok).map((r) => r.s3Key);
		const errors = results
			.filter((r): r is Extract<(typeof results)[number], { ok: false }> => !r.ok)
			.map((r) => r.error);

		return {
			deleted: deletedFiles.length,
			deletedFiles,
			errors: errors.length > 0 ? errors : undefined,
		};
	}
}
