import type { PreviewItemPayload } from "@video-editor/contract/iframe/from-parent";
import {
	type ParentToEditorMessage,
	parentToEditorMessageSchema,
} from "@video-editor/contract/iframe/from-parent";
import {
	createPreviewItemAddedMessage,
	createPreviewItemRejectedMessage,
	createProjectClearedMessage,
	type EditorPreviewItemAddedMessage,
	type EditorPreviewItemRejectedMessage,
	type EditorProjectClearedMessage,
	type EditorToParentMessage,
} from "@video-editor/contract/iframe/to-parent";

export type ResponseCacheEntry =
	| EditorPreviewItemAddedMessage
	| EditorPreviewItemRejectedMessage
	| EditorProjectClearedMessage;

export interface ParentMessageDeps {
	allowedOrigins: Set<string>;
	responseCache: Map<string, ResponseCacheEntry>;
	maxCacheSize: number;
	addPreviewItem: (payload: PreviewItemPayload) => Promise<string>;
	clearProject: () => void;
	postResponse: (
		source: MessageEventSource | null,
		targetOrigin: string,
		message: EditorToParentMessage,
	) => void;
}

interface MinimalMessageEvent {
	origin: string;
	source: MessageEventSource | null;
	data: unknown;
}

const setCached = (
	cache: Map<string, ResponseCacheEntry>,
	maxSize: number,
	requestId: string,
	response: ResponseCacheEntry,
) => {
	if (cache.size >= maxSize) {
		const firstKey = cache.keys().next().value;
		if (firstKey !== undefined) cache.delete(firstKey);
	}
	cache.set(requestId, response);
};

const extractRawRequestId = (data: unknown): string | undefined => {
	if (
		typeof data === "object" &&
		data !== null &&
		"requestId" in data &&
		typeof (data as { requestId?: unknown }).requestId === "string"
	) {
		return (data as { requestId: string }).requestId;
	}
	return undefined;
};

export const handleParentMessage = async (
	deps: ParentMessageDeps,
	event: MinimalMessageEvent,
): Promise<void> => {
	const {
		allowedOrigins,
		responseCache,
		maxCacheSize,
		addPreviewItem,
		clearProject,
		postResponse,
	} = deps;

	if (!allowedOrigins.has(event.origin)) {
		return;
	}

	const reject = (requestId: string | undefined, reason: string) => {
		const response: EditorPreviewItemRejectedMessage = createPreviewItemRejectedMessage(
			reason,
			requestId,
		);
		if (requestId) {
			setCached(responseCache, maxCacheSize, requestId, response);
		}
		postResponse(event.source, event.origin, response);
	};

	const rawRequestId = extractRawRequestId(event.data);

	const parsed = parentToEditorMessageSchema.safeParse(event.data);
	if (!parsed.success) {
		reject(rawRequestId, parsed.error.issues[0]?.message || "Invalid message payload");
		return;
	}

	const message: ParentToEditorMessage = parsed.data;

	if (message.requestId) {
		const cachedResponse = responseCache.get(message.requestId);
		if (cachedResponse) {
			postResponse(event.source, event.origin, cachedResponse);
			return;
		}
	}

	if (message.type === "EDITOR_CLEAR_PROJECT") {
		try {
			clearProject();
			const response: EditorProjectClearedMessage = createProjectClearedMessage(message.requestId);
			if (message.requestId) {
				setCached(responseCache, maxCacheSize, message.requestId, response);
			}
			postResponse(event.source, event.origin, response);
		} catch (error) {
			reject(message.requestId, error instanceof Error ? error.message : "Failed to clear project");
		}
		return;
	}

	try {
		const itemId = await addPreviewItem(message.payload);
		const response: EditorPreviewItemAddedMessage = createPreviewItemAddedMessage(
			itemId,
			message.requestId,
		);
		if (message.requestId) {
			setCached(responseCache, maxCacheSize, message.requestId, response);
		}
		postResponse(event.source, event.origin, response);
	} catch (error) {
		reject(
			message.requestId,
			error instanceof Error ? error.message : "Failed to add preview item",
		);
	}
};
