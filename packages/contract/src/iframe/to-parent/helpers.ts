import type { SavedMediaItem } from "../../shared/saved-media.js";
import type {
	EditorMediaSavedMessage,
	EditorPreviewItemAddedMessage,
	EditorPreviewItemRejectedMessage,
	EditorProjectClearedMessage,
} from "./schemas.js";

export const createPreviewItemAddedMessage = (
	itemId: string,
	requestId?: string,
): EditorPreviewItemAddedMessage => ({
	type: "EDITOR_PREVIEW_ITEM_ADDED",
	requestId,
	itemId,
});

export const createPreviewItemRejectedMessage = (
	reason: string,
	requestId?: string,
): EditorPreviewItemRejectedMessage => ({
	type: "EDITOR_PREVIEW_ITEM_REJECTED",
	requestId,
	reason,
});

export const createProjectClearedMessage = (requestId?: string): EditorProjectClearedMessage => ({
	type: "EDITOR_PROJECT_CLEARED",
	requestId,
});

export const createMediaSavedMessage = (
	mediaName: string,
	downloadToComputer: boolean,
	saveToPersonalChannel: boolean,
	url: string,
	exportType: "mp4" | "webp",
	items: SavedMediaItem[],
	mediaId: string,
	selectedUnitChannelIds: string[],
): EditorMediaSavedMessage => ({
	type: "EDITOR_MEDIA_SAVED",
	mediaId,
	mediaName,
	downloadToComputer,
	saveToPersonalChannel,
	selectedUnitChannelIds,
	url,
	exportType,
	items,
});
