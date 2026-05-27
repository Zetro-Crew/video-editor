import type StateManager from "@designcombo/state";
import {
	createPreviewItemAddedMessage,
	createPreviewItemRejectedMessage,
	createProjectClearedMessage,
	type EditorPreviewItemAddedMessage,
	type EditorPreviewItemRejectedMessage,
	type EditorProjectClearedMessage,
	type EditorReadyMessage,
	type EditorToParentMessage,
	type ParentToEditorMessage,
	parentToEditorMessageSchema,
} from "@video-editor/iframe-contract";
import { useEffect, useMemo, useRef } from "react";
import { addPreviewItemToEditor, clearProject } from "./payload-intake";
import { parseAllowedOrigins } from "./utils";

type ResponseCacheEntry =
	| EditorPreviewItemAddedMessage
	| EditorPreviewItemRejectedMessage
	| EditorProjectClearedMessage;

export const useEditorPostMessage = (stateManager: StateManager) => {
	const authTokenRef = useRef<string>("");
	const responseCacheRef = useRef<Map<string, ResponseCacheEntry>>(new Map());
	const MAX_RESPONSE_CACHE_SIZE = 100;
	const allowedOrigins = useMemo(() => {
		const envOrigins = parseAllowedOrigins(import.meta.env.VITE_EDITOR_PARENT_ORIGINS);
		envOrigins.add(window.location.origin);
		return envOrigins;
	}, []);

	useEffect(() => {
		const setCached = (requestId: string, response: ResponseCacheEntry) => {
			const cache = responseCacheRef.current;
			if (cache.size >= MAX_RESPONSE_CACHE_SIZE) {
				const firstKey = cache.keys().next().value;
				if (firstKey !== undefined) cache.delete(firstKey);
			}
			cache.set(requestId, response);
		};

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

		const reject = (
			source: MessageEventSource | null,
			targetOrigin: string,
			requestId: string | undefined,
			reason: string,
		) => {
			const response: EditorPreviewItemRejectedMessage = createPreviewItemRejectedMessage(
				reason,
				requestId,
			);
			if (requestId) {
				setCached(requestId, response);
			}
			postResponse(source, targetOrigin, response);
		};

		const handleMessage = async (event: MessageEvent) => {
			if (!allowedOrigins.has(event.origin)) {
				return;
			}

			const rawRequestId =
				typeof event.data === "object" &&
				event.data !== null &&
				"requestId" in event.data &&
				typeof event.data.requestId === "string"
					? event.data.requestId
					: undefined;

			const parsed = parentToEditorMessageSchema.safeParse(event.data);
			if (!parsed.success) {
				reject(
					event.source,
					event.origin,
					rawRequestId,
					parsed.error.issues[0]?.message || "Invalid message payload",
				);
				return;
			}

			const message: ParentToEditorMessage = parsed.data;

			if (message.type === "EDITOR_SET_AUTH") {
				authTokenRef.current = message.token;
				return;
			}

			if (message.requestId) {
				const cachedResponse = responseCacheRef.current.get(message.requestId);
				if (cachedResponse) {
					postResponse(event.source, event.origin, cachedResponse);
					return;
				}
			}

			if (message.type === "EDITOR_CLEAR_PROJECT") {
				try {
					clearProject(stateManager);
					const response: EditorProjectClearedMessage = createProjectClearedMessage(
						message.requestId,
					);
					if (message.requestId) {
						setCached(message.requestId, response);
					}
					postResponse(event.source, event.origin, response);
				} catch (error) {
					reject(
						event.source,
						event.origin,
						message.requestId,
						error instanceof Error ? error.message : "Failed to clear project",
					);
				}
				return;
			}

			try {
				const itemId = await addPreviewItemToEditor(
					stateManager,
					message.payload,
					authTokenRef.current,
				);
				const response: EditorPreviewItemAddedMessage = createPreviewItemAddedMessage(
					itemId,
					message.requestId,
				);
				if (message.requestId) {
					setCached(message.requestId, response);
				}
				postResponse(event.source, event.origin, response);
			} catch (error) {
				reject(
					event.source,
					event.origin,
					message.requestId,
					error instanceof Error ? error.message : "Failed to add preview item",
				);
			}
		};

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
