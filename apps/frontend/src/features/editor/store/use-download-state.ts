import type { IDesign, ITrackItem } from "@designcombo/types";
import { create } from "zustand";
import { extractSavedItems } from "../utils/extract-saved-items";
import { getSafeCurrentFrame } from "../utils/time";
import useCompositionStore from "./use-composition-store";
import useEditorRefs from "./use-editor-refs";

interface SaveMetadata {
	mediaName: string;
	mediaId: string;
	downloadToComputer: boolean;
	saveToPersonalChannel: boolean;
	selectedChannelIds: string[];
}

interface DownloadState {
	projectId: string;
	exporting: boolean;
	submitted: boolean;
	retryCount: number;
	exportType: "mp4" | "webp";
	payload?: IDesign;
	error?: string;
	displayProgressModal: boolean;
	saveMetadata?: SaveMetadata;
	actions: {
		setProjectId: (projectId: string) => void;
		setExporting: (exporting: boolean) => void;
		setExportType: (exportType: "mp4" | "webp") => void;
		setPayload: (payload: IDesign) => void;
		setSubmitted: () => void;
		setError: (error: string) => void;
		incrementRetryCount: () => void;
		resetToForm: () => void;
		startExport: (params: { copyWatchLink: boolean }) => Promise<void>;
		setDisplayProgressModal: (displayProgressModal: boolean) => void;
		setSaveMetadata: (metadata: SaveMetadata) => void;
	};
}

export const useDownloadState = create<DownloadState>((set, get) => ({
	projectId: "",
	exporting: false,
	submitted: false,
	retryCount: 0,
	exportType: "mp4",
	displayProgressModal: false,
	actions: {
		setProjectId: (projectId) => set({ projectId }),
		setExporting: (exporting) => set({ exporting }),
		setExportType: (exportType) => set({ exportType }),
		setPayload: (payload) => set({ payload }),
		setSubmitted: () => set({ submitted: true, exporting: false, error: undefined }),
		setError: (error) => set({ error, exporting: false }),
		incrementRetryCount: () => set((s) => ({ retryCount: s.retryCount + 1 })),
		resetToForm: () => set({ error: undefined, submitted: false, exporting: false, retryCount: 0 }),
		setDisplayProgressModal: (displayProgressModal) => set({ displayProgressModal }),
		setSaveMetadata: (metadata) => set({ saveMetadata: metadata }),
		startExport: async ({ copyWatchLink }) => {
			try {
				const { payload, exportType, saveMetadata } = get();

				if (!payload) throw new Error("Payload is not defined");

				set({ error: undefined, exporting: true, submitted: false, displayProgressModal: true });

				const { playerRef } = useEditorRefs.getState();
				const { fps } = useCompositionStore.getState();
				const currentFrame = getSafeCurrentFrame(playerRef);
				const safeFps = fps > 0 ? fps : 30;
				const frameTimeMs = Math.round((currentFrame / safeFps) * 1000);

				const response = await fetch("/render", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						design: payload,
						options: { fps: 30, size: payload.size, format: exportType, frameTimeMs },
						saveMetadata: saveMetadata
							? {
									...saveMetadata,
									items: extractSavedItems(
										(payload.trackItemsMap ?? {}) as Record<string, ITrackItem>,
									),
								}
							: undefined,
					}),
				});

				if (!response.ok) throw new Error("שגיאה בשליחת בקשת הייצוא.");

				if (copyWatchLink && saveMetadata?.mediaId) {
					void navigator.clipboard.writeText(
						`${window.location.origin}/watch/${saveMetadata.mediaId}`,
					);
				}

				get().actions.setSubmitted();
			} catch (error) {
				console.error(error);
				get().actions.setError(error instanceof Error ? error.message : "שגיאה בייצוא");
			}
		},
	},
}));
