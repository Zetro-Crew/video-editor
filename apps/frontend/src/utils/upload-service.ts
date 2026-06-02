import type { GetSignedUrlResponse } from "@video-editor/contract/internal/upload";
import axios from "axios";
import { serverUrl } from "./fetch-server";

const EXT_MIME_FALLBACK: Record<string, string> = {
	".mp4": "video/mp4",
	".m4v": "video/x-m4v",
	".webm": "video/webm",
	".mov": "video/quicktime",
	".mpd": "application/dash+xml",
	".mp3": "audio/mpeg",
	".m4a": "audio/mp4",
	".wav": "audio/wav",
	".ogg": "audio/ogg",
	".aac": "audio/aac",
	".flac": "audio/flac",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
};

function resolveMimetype(file: File): string {
	if (file.type) return file.type;
	const dot = file.name.lastIndexOf(".");
	const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
	return EXT_MIME_FALLBACK[ext] ?? "application/octet-stream";
}

type UploadProgressCallback = (uploadId: string, progress: number) => void;

type UploadStatusCallback = (
	uploadId: string,
	status: "uploaded" | "failed",
	error?: string,
) => void;

export interface UploadCallbacks {
	onProgress: UploadProgressCallback;
	onStatus: UploadStatusCallback;
}

export interface UploadData {
	fileName: string;
	filePath: string;
	fileSize: number;
	contentType: string;
	url: string;
	metadata: { uploadedUrl: string };
	folder: string | null;
	type: string;
	method: string;
	origin: string;
	status: string;
	isPreview: boolean;
}

async function processFileUpload(
	uploadId: string,
	file: File,
	callbacks: UploadCallbacks,
): Promise<UploadData> {
	const mimetype = resolveMimetype(file);
	try {
		const { data: signed } = await axios.post<GetSignedUrlResponse>(
			serverUrl("/upload/signed-url"),
			{ filename: file.name, mimetype, size: file.size },
			{ validateStatus: () => true },
		);

		if (!signed?.uploadUrl) {
			throw new Error("Failed to get signed upload URL");
		}

		const putResponse = await axios.put(signed.uploadUrl, file, {
			headers: { "Content-Type": mimetype, "Content-Length": String(file.size) },
			onUploadProgress: (progressEvent) => {
				const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
				callbacks.onProgress(uploadId, percent);
			},
			validateStatus: () => true,
		});

		if (putResponse.status < 200 || putResponse.status >= 300) {
			throw new Error(`Upload failed with status ${putResponse.status}`);
		}

		const uploadData: UploadData = {
			fileName: signed.filename,
			filePath: signed.s3Key,
			fileSize: file.size,
			contentType: mimetype,
			url: signed.publicUrl,
			metadata: { uploadedUrl: signed.publicUrl },
			folder: null,
			type: mimetype.split("/")[0],
			method: "direct",
			origin: "user",
			status: "uploaded",
			isPreview: false,
		};

		callbacks.onStatus(uploadId, "uploaded");
		return uploadData;
	} catch (error) {
		callbacks.onStatus(uploadId, "failed", (error as Error).message);
		throw error;
	}
}

export async function processUpload(
	uploadId: string,
	upload: { file?: File },
	callbacks: UploadCallbacks,
): Promise<UploadData> {
	if (upload.file) {
		return await processFileUpload(uploadId, upload.file, callbacks);
	}
	callbacks.onStatus(uploadId, "failed", "No file provided");
	throw new Error("No file provided");
}
