import fs from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
	CreateBucketCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Logger } from "@ztube/observability";
import type {
	PresignedUploadOptions,
	StoragePort,
} from "../../shared/application/ports/outbound/StoragePort.ts";
import { downloadFile as downloadHttpFile } from "../../shared/utils/file.utils.ts";

export interface S3StorageConfig {
	bucket: string;
	region: string;
	endpoint: string;
	forcePathStyle: boolean;
	accessKeyId: string;
	secretAccessKey: string;
}

export class S3StorageAdapter implements StoragePort {
	protected client: S3Client;
	private readonly bucket: string;
	private readonly endpointUrl?: URL;
	private readonly forcePathStyle: boolean;

	constructor(s3Config: S3StorageConfig) {
		this.bucket = s3Config.bucket;
		this.forcePathStyle = s3Config.forcePathStyle;
		this.endpointUrl = s3Config.endpoint ? new URL(s3Config.endpoint) : undefined;
		this.client = new S3Client({
			region: s3Config.region,
			endpoint: s3Config.endpoint,
			forcePathStyle: s3Config.forcePathStyle,
			credentials: {
				accessKeyId: s3Config.accessKeyId,
				secretAccessKey: s3Config.secretAccessKey,
			},
		});
	}

	public uploadStream = async (
		stream: Readable,
		key: string,
		contentType?: string,
	): Promise<void> => {
		Logger.logInfo("[s3] upload started", { key });
		const upload = new Upload({
			client: this.client,
			params: {
				Bucket: this.bucket,
				Key: key,
				Body: stream,
				ContentType: contentType,
			},
		});

		await upload.done();
		Logger.logInfo("[s3] upload complete", { key });
	};

	protected downloadFile = async (key: string, outputPath: string): Promise<void> => {
		Logger.logInfo("[s3] download started", { key });
		const command = new GetObjectCommand({
			Bucket: this.bucket,
			Key: key,
		});

		const response = await this.client.send(command);

		if (!response.Body) {
			throw new Error(`Failed to download file from S3: ${key}`);
		}

		await pipeline(response.Body as Readable, fs.createWriteStream(outputPath));
		Logger.logInfo("[s3] download complete", { key });
	};

	private tryExtractKeyFromUrl = (urlOrKey: string): string | null => {
		let url: URL;
		try {
			url = new URL(urlOrKey);
		} catch {
			return urlOrKey;
		}

		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}

		const pathname = url.pathname.replace(/^\/+/, "");
		if (!pathname) {
			return null;
		}

		if (this.forcePathStyle) {
			const prefix = `${this.bucket}/`;
			if (pathname.startsWith(prefix)) {
				return pathname.slice(prefix.length);
			}
		}

		const endpointHost = this.endpointUrl?.hostname;
		if (endpointHost) {
			const virtualHostedBucketPrefix = `${this.bucket}.`;
			if (url.hostname === endpointHost && !this.forcePathStyle && pathname.length > 0) {
				return pathname;
			}

			if (
				url.hostname.startsWith(virtualHostedBucketPrefix) &&
				url.hostname.endsWith(endpointHost) &&
				pathname.length > 0
			) {
				return pathname;
			}
		}

		return null;
	};

	public downloadToFile = async (urlOrKey: string, outputPath: string): Promise<void> => {
		const key = this.tryExtractKeyFromUrl(urlOrKey);
		if (key) {
			await this.downloadFile(key, outputPath);
			return;
		}

		Logger.logInfo("[s3] downloading via HTTP (external URL)");
		await downloadHttpFile(urlOrKey, outputPath);
	};

	public getPresignedUrl = async (key: string, expiresIn = 3600): Promise<string> => {
		if (expiresIn <= 0) {
			throw new Error(`expiresIn must be positive, got ${expiresIn}`);
		}
		Logger.logInfo("[s3] generating presigned download URL", { key, expiresIn });
		const command = new GetObjectCommand({
			Bucket: this.bucket,
			Key: key,
		});

		return getSignedUrl(this.client, command, { expiresIn });
	};

	public getPresignedUploadUrl = async (
		key: string,
		options: PresignedUploadOptions = {},
	): Promise<string> => {
		const { contentType, contentLength, expiresIn = 3600 } = options;
		if (expiresIn <= 0) {
			throw new Error(`expiresIn must be positive, got ${expiresIn}`);
		}
		if (contentLength !== undefined && contentLength <= 0) {
			throw new Error(`contentLength must be positive, got ${contentLength}`);
		}
		Logger.logInfo("[s3] generating presigned upload URL", { key, expiresIn, contentLength });
		// ContentLength gets baked into the SigV4 signed headers — the client
		// must PUT with a matching Content-Length, otherwise S3/MinIO rejects.
		const command = new PutObjectCommand({
			Bucket: this.bucket,
			Key: key,
			ContentType: contentType,
			ContentLength: contentLength,
		});

		return getSignedUrl(this.client, command, { expiresIn });
	};

	public deleteFile = async (key: string): Promise<void> => {
		Logger.logInfo("[s3] deleting file", { key });
		const command = new DeleteObjectCommand({
			Bucket: this.bucket,
			Key: key,
		});

		await this.client.send(command);
	};

	protected fileExists = async (key: string): Promise<boolean> => {
		try {
			const command = new HeadObjectCommand({
				Bucket: this.bucket,
				Key: key,
			});
			await this.client.send(command);
			return true;
		} catch (err) {
			// Narrow to "not found" only. A transient 5xx must throw so the caller
			// can decide (retry / fail). Swallowing all errors here makes idempotency
			// checks lie: a flaky HEAD turns into "object missing", which re-runs
			// the render even when output already exists.
			if (isNotFoundError(err)) return false;
			throw err;
		}
	};

	public exists = async (key: string): Promise<boolean> => this.fileExists(key);

	public ensureBucketExists = async (): Promise<void> => {
		try {
			await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
			return;
		} catch (err) {
			if (!isNotFoundError(err)) throw err;
		}
		await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
	};
}

function isNotFoundError(err: unknown): boolean {
	if (typeof err !== "object" || err === null) return false;
	const candidate = err as {
		name?: string;
		$metadata?: { httpStatusCode?: number };
		Code?: string;
	};
	if (candidate.name === "NotFound" || candidate.name === "NoSuchKey") return true;
	if (candidate.Code === "NotFound" || candidate.Code === "NoSuchKey") return true;
	if (candidate.$metadata?.httpStatusCode === 404) return true;
	return false;
}
