import type { IDesign } from "@designcombo/types";
import { create } from "zustand";
import { getSafeCurrentFrame } from "../utils/time";
import useCompositionStore from "./use-composition-store";
import useEditorRefs from "./use-editor-refs";

interface Output {
	url: string;
	type: "mp4" | "webp";
}

interface DownloadState {
	projectId: string;
	jobId: string;
	exporting: boolean;
	exportAborted: boolean;
	exportType: "mp4" | "webp";
	progress: number;
	output?: Output;
	payload?: IDesign;
	error?: string;
	displayProgressModal: boolean;
	actions: {
		setProjectId: (projectId: string) => void;
		setExporting: (exporting: boolean) => void;
		setExportType: (exportType: "mp4" | "webp") => void;
		setProgress: (progress: number) => void;
		setState: (state: Partial<DownloadState>) => void;
		setOutput: (output: Output) => void;
		startExport: () => void;
		cancelExport: () => void;
		setDisplayProgressModal: (displayProgressModal: boolean) => void;
	};
}

const IN_PROGRESS_EXPORT_STATUSES = new Set([
	"PENDING",
	"PROCESSING",
	"PROGRESS",
	"IN_PROGRESS",
	"QUEUED",
]);

//const baseUrl = "https://api.combo.sh/v1";

export const useDownloadState = create<DownloadState>((set, get) => ({
	projectId: "",
	jobId: "",
	exporting: false,
	exportAborted: false,
	exportType: "mp4",
	progress: 0,
	displayProgressModal: false,
	actions: {
		setProjectId: (projectId) => set({ projectId }),
		setExporting: (exporting) => set({ exporting }),
		setExportType: (exportType: "mp4" | "webp") => set({ exportType }),
		setProgress: (progress) => set({ progress }),
		setState: (state) => set({ ...state }),
		setOutput: (output) => set({ output }),
		setDisplayProgressModal: (displayProgressModal) => set({ displayProgressModal }),
		cancelExport: () => {
			const { jobId } = get();
			if (jobId) {
				void fetch(`/render?id=${encodeURIComponent(jobId)}`, { method: "DELETE" });
			}
			set({
				exportAborted: true,
				exporting: false,
				displayProgressModal: false,
				progress: 0,
				output: undefined,
				error: undefined,
				jobId: "",
			});
		},
		startExport: async () => {
			set({ exportAborted: false });
			try {
				const { payload, exportType } = get();

				if (!payload) throw new Error("Payload is not defined");

				set({
					error: undefined,
					exporting: true,
					displayProgressModal: true,
					progress: 0,
					output: undefined,
					jobId: "",
					exportAborted: false,
				});

				const { playerRef } = useEditorRefs.getState();
				const { fps } = useCompositionStore.getState();
				const currentFrame = getSafeCurrentFrame(playerRef);
				const safeFps = fps > 0 ? fps : 30;
				const frameTimeMs = Math.round((currentFrame / safeFps) * 1000);

				const response = await fetch("/render", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						design: payload,
						options: {
							fps: 30,
							size: payload.size,
							format: exportType,
							frameTimeMs,
						},
					}),
				});

				if (!response.ok) throw new Error("Failed to submit export request.");

				const jobInfo = await response.json();
				const jobId = jobInfo?.render?.id || jobInfo?.renderId || jobInfo?.id || "";

				if (!jobId) {
					throw new Error("Export request succeeded without a render job id.");
				}

				set({ jobId });

				const pollUntilComplete = async (): Promise<void> => {
					const statusResponse = await fetch(
						`/render?id=${encodeURIComponent(jobId)}&type=${get().exportType}`,
						{
							headers: {
								"Content-Type": "application/json",
							},
						},
					);

					if (!statusResponse.ok) {
						const errorText = await statusResponse.text();
						throw new Error(
							`Failed to fetch export status (${statusResponse.status}): ${errorText}`,
						);
					}

					const statusInfo = await statusResponse.json();
					const render = statusInfo?.render ?? statusInfo;
					const status = String(render?.status ?? "").toUpperCase();
					const renderError = typeof render?.error === "string" ? render.error : undefined;
					const progressValue =
						typeof render?.progress === "number"
							? render.progress
							: typeof render?.percentage === "number"
								? render.percentage
								: undefined;
					const url = render?.presigned_url || render?.url || render?.download_url || "";

					if (typeof progressValue === "number") {
						set({ progress: progressValue });
					}

					if (status === "CANCELLED") {
						return;
					}

					if (status === "COMPLETED") {
						if (!url) {
							throw new Error("Export completed without a download URL.");
						}

						set({
							error: undefined,
							exporting: false,
							progress: 100,
							output: { url, type: get().exportType },
							jobId: "",
						});
						return;
					}

					if (IN_PROGRESS_EXPORT_STATUSES.has(status)) {
						await new Promise((resolve) => setTimeout(resolve, 250));
						if (get().exportAborted) return;
						await pollUntilComplete();
						return;
					}

					throw new Error(
						renderError
							? `Export failed with status: ${status || "UNKNOWN"} - ${renderError}`
							: `Export failed with status: ${status || "UNKNOWN"}`,
					);
				};

				await pollUntilComplete();
			} catch (error) {
				console.error(error);
				set({
					error: error instanceof Error ? error.message : "Export failed",
					exporting: false,
					displayProgressModal: true,
				});
			}
		},
	},
}));
