import type StateManager from "@designcombo/state";
import type {
	EditorReadyMessage,
	EditorToParentMessage,
} from "@video-editor/contract/iframe/to-parent";
import { useEffect, useMemo, useRef } from "react";
import { handleParentMessage, type ResponseCacheEntry } from "./handle-parent-message";
import { addPreviewItemToEditor, addStoredMediaToEditor, clearProject } from "./payload-intake";
import { parseAllowedOrigins } from "./utils";

export const useEditorPostMessage = (stateManager: StateManager) => {
	const responseCacheRef = useRef<Map<string, ResponseCacheEntry>>(new Map());
	const MAX_RESPONSE_CACHE_SIZE = 100;
	const allowedOrigins = useMemo(() => {
		const envOrigins = parseAllowedOrigins(import.meta.env.VITE_EDITOR_PARENT_ORIGINS);
		envOrigins.add(window.location.origin);
		return envOrigins;
	}, []);

	useEffect(() => {
		const postResponse = (
			source: MessageEventSource | null,
			targetOrigin: string,
			message: EditorToParentMessage,
		) => {
			if (!source || typeof source.postMessage !== "function") {
				return;
			}
			source.postMessage(message, { targetOrigin });
		};

		const handleMessage = (event: MessageEvent) =>
			handleParentMessage(
				{
					allowedOrigins,
					responseCache: responseCacheRef.current,
					maxCacheSize: MAX_RESPONSE_CACHE_SIZE,
					addPreviewItem: (payload) => addPreviewItemToEditor(stateManager, payload),
					addStoredMedia: (mediaId) => addStoredMediaToEditor(stateManager, mediaId),
					clearProject: () => clearProject(stateManager),
					postResponse,
				},
				event,
			);

		window.addEventListener("message", handleMessage);
		if (window.parent !== window) {
			const readyMsg: EditorReadyMessage = { type: "EDITOR_READY" };
			window.parent.postMessage(readyMsg, "*");
		}
		return () => {
			window.removeEventListener("message", handleMessage);
		};
	}, [allowedOrigins, stateManager]);
};
