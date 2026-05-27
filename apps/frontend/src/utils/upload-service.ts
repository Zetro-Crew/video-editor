import axios from "axios";

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
	try {
		const formData = new FormData();
		formData.append("userId", "PJ1nkaufw0hZPyhN7bWCP");
		formData.append("file", file);

		const uploadResponse = await axios.post("/uploads/file", formData, {
			onUploadProgress: (progressEvent) => {
				const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
				callbacks.onProgress(uploadId, percent);
			},
			validateStatus: () => true,
		});

		if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
			throw new Error(`Upload failed with status ${uploadResponse.status}`);
		}

		const { upload: uploadInfo } = uploadResponse.data;

		if (!uploadInfo) {
			throw new Error("Upload route returned no upload payload");
		}

		// Construct upload data from uploadInfo
		const uploadData = {
			fileName: uploadInfo.fileName,
			filePath: uploadInfo.filePath,
			fileSize: file.size,
			contentType: uploadInfo.contentType,
			url: uploadInfo.url,
			metadata: { uploadedUrl: uploadInfo.url },
			folder: uploadInfo.folder || null,
			type: uploadInfo.contentType.split("/")[0],
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
