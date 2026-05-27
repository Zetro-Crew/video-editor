import { create } from "zustand";
import { persist } from "zustand/middleware";
import { processUpload, type UploadCallbacks } from "@/utils/upload-service";
import { autoAddUploadedMedia } from "../utils/upload-media";

interface UploadFile {
	id: string;
	file?: File;
	type?: string;
	status?: "pending" | "uploading" | "uploaded" | "failed";
	progress?: number;
	error?: string;
	removeTimeoutId?: ReturnType<typeof setTimeout>;
}

interface IUploadStore {
	showUploadModal: boolean;
	setShowUploadModal: (showUploadModal: boolean) => void;
	files: UploadFile[];
	setFiles: (files: UploadFile[] | ((prev: UploadFile[]) => UploadFile[])) => void;

	pendingUploads: UploadFile[];
	addPendingUploads: (uploads: UploadFile[]) => void;
	activeUploads: UploadFile[];
	processUploads: () => void;
	updateUploadProgress: (id: string, progress: number) => void;
	setUploadStatus: (id: string, status: UploadFile["status"], error?: string) => void;
	removeUpload: (id: string) => void;
	uploads: any[];
	setUploads: (uploads: any[] | ((prev: any[]) => any[])) => void;
}

const useUploadStore = create<IUploadStore>()(
	persist(
		(set, get) => ({
			showUploadModal: false,
			setShowUploadModal: (showUploadModal: boolean) => set({ showUploadModal }),

			files: [],
			setFiles: (files: UploadFile[] | ((prev: UploadFile[]) => UploadFile[])) =>
				set((state) => ({
					files:
						typeof files === "function"
							? (files as (prev: UploadFile[]) => UploadFile[])(state.files)
							: files,
				})),

			pendingUploads: [],
			addPendingUploads: (uploads: UploadFile[]) => {
				set((state) => ({
					pendingUploads: [...state.pendingUploads, ...uploads],
				}));
			},

			activeUploads: [],
			processUploads: () => {
				const { pendingUploads, updateUploadProgress, setUploadStatus, removeUpload, setUploads } =
					get();

				// Move pending uploads to active with 'uploading' status
				if (pendingUploads.length > 0) {
					set((state) => ({
						activeUploads: [
							...state.activeUploads,
							...pendingUploads.map((u) => ({
								...u,
								status: "uploading" as const,
								progress: 0,
							})),
						],
						pendingUploads: [],
					}));
				}

				// Get updated activeUploads after moving pending ones
				const currentActiveUploads = get().activeUploads;

				const callbacks: UploadCallbacks = {
					onProgress: (uploadId, progress) => {
						updateUploadProgress(uploadId, progress);
					},
					onStatus: (uploadId, status, error) => {
						setUploadStatus(uploadId, status, error);
						if (status === "uploaded" || status === "failed") {
							const tid = setTimeout(() => removeUpload(uploadId), 3000);
							set((state) => ({
								activeUploads: state.activeUploads.map((u) =>
									u.id === uploadId ? { ...u, removeTimeoutId: tid } : u,
								),
							}));
						}
					},
				};

				// Process all uploading items
				for (const upload of currentActiveUploads.filter(
					(upload) => upload.status === "uploading",
				)) {
					processUpload(upload.id, { file: upload.file }, callbacks)
						.then((uploadData) => {
							// Add the complete upload data to the uploads array
							if (uploadData) {
								setUploads((prev) => [...prev, uploadData]);
								autoAddUploadedMedia(uploadData);
							}
						})
						.catch((error) => {
							console.error("Upload failed:", error);
						});
				}
			},
			updateUploadProgress: (id: string, progress: number) =>
				set((state) => ({
					activeUploads: state.activeUploads.map((u) => (u.id === id ? { ...u, progress } : u)),
				})),
			setUploadStatus: (id: string, status: UploadFile["status"], error?: string) =>
				set((state) => ({
					activeUploads: state.activeUploads.map((u) =>
						u.id === id ? { ...u, status, error } : u,
					),
				})),
			removeUpload: (id: string) =>
				set((state) => {
					const upload = state.activeUploads.find((u) => u.id === id);
					if (upload?.removeTimeoutId) clearTimeout(upload.removeTimeoutId);
					return {
						activeUploads: state.activeUploads.filter((u) => u.id !== id),
					};
				}),
			uploads: [],
			setUploads: (uploads: any[] | ((prev: any[]) => any[])) =>
				set((state) => ({
					uploads:
						typeof uploads === "function"
							? (uploads as (prev: any[]) => any[])(state.uploads)
							: uploads,
				})),
		}),
		{
			name: "upload-store",
			partialize: (state) => ({ uploads: state.uploads }),
		},
	),
);

export default useUploadStore;
