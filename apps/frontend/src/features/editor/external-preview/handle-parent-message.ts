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
	addStoredMedia: (mediaId: string) => Promise<string>;
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

const extractRawMediaId = (data: unknown): string | undefined => {
	if (
		typeof data !== "object" ||
		data === null ||
		!("type" in data) ||
		(data as { type?: unknown }).type !== "EDITOR_ADD_MEDIA" ||
		!("mediaId" in data)
	) {
		return undefined;
	}
	const raw = (data as { mediaId: unknown }).mediaId;
	if (typeof raw === "string") return raw;
	if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
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
		addStoredMedia,
		clearProject,
		postResponse,
	} = deps;

	if (!allowedOrigins.has(event.origin)) {
		return;
	}

	const reject = (correlation: { requestId?: string; mediaId?: string }, reason: string) => {
		const response: EditorPreviewItemRejectedMessage = createPreviewItemRejectedMessage(
			reason,
			correlation,
		);
		const cacheKey =
			correlation.requestId ??
			(correlation.mediaId ? `add-media:${correlation.mediaId}` : undefined);
		if (cacheKey) {
			setCached(responseCache, maxCacheSize, cacheKey, response);
		}
		postResponse(event.source, event.origin, response);
	};

	const rawRequestId = extractRawRequestId(event.data);
	const rawMediaId = extractRawMediaId(event.data);

	const parsed = parentToEditorMessageSchema.safeParse(event.data);
	if (!parsed.success) {
		reject(
			{ requestId: rawRequestId, mediaId: rawMediaId },
			parsed.error.issues[0]?.message || "Invalid message payload",
		);
		return;
	}

	const message: ParentToEditorMessage = parsed.data;

	const cacheKey =
		message.type === "EDITOR_ADD_MEDIA" ? `add-media:${message.mediaId}` : message.requestId;
	if (cacheKey) {
		const cachedResponse = responseCache.get(cacheKey);
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
			reject(
				{ requestId: message.requestId },
				error instanceof Error ? error.message : "Failed to clear project",
			);
		}
		return;
	}

	if (message.type === "EDITOR_ADD_MEDIA") {
		try {
			const itemId = await addStoredMedia(message.mediaId);
			const response: EditorPreviewItemAddedMessage = createPreviewItemAddedMessage(itemId, {
				mediaId: message.mediaId,
			});
			setCached(responseCache, maxCacheSize, `add-media:${message.mediaId}`, response);
			postResponse(event.source, event.origin, response);
		} catch (error) {
			reject(
				{ mediaId: message.mediaId },
				error instanceof Error ? error.message : "Failed to add stored media",
			);
		}
		return;
	}

	try {
		const itemId = await addPreviewItem(message.payload);
		const response: EditorPreviewItemAddedMessage = createPreviewItemAddedMessage(itemId, {
			requestId: message.requestId,
		});
		if (message.requestId) {
			setCached(responseCache, maxCacheSize, message.requestId, response);
		}
		postResponse(event.source, event.origin, response);
	} catch (error) {
		reject(
			{ requestId: message.requestId },
			error instanceof Error ? error.message : "Failed to add preview item",
		);
	}
};
