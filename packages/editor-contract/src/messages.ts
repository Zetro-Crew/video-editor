import type { PreviewItemPayload } from "./payloads.js";

export type EditorAddPreviewItemMessage = {
	type: "EDITOR_ADD_PREVIEW_ITEM";
	requestId?: string;
	payload: PreviewItemPayload;
};

export type EditorClearProjectMessage = {
	type: "EDITOR_CLEAR_PROJECT";
	requestId?: string;
};

export type EditorSetAuthMessage = {
	type: "EDITOR_SET_AUTH";
	token: string;
};

export type ParentToEditorMessage =
	| EditorAddPreviewItemMessage
	| EditorClearProjectMessage
	| EditorSetAuthMessage;

export type EditorPreviewItemAddedMessage = {
	type: "EDITOR_PREVIEW_ITEM_ADDED";
	requestId?: string;
	itemId: string;
};

export type EditorPreviewItemRejectedMessage = {
	type: "EDITOR_PREVIEW_ITEM_REJECTED";
	requestId?: string;
	reason: string;
};

export type EditorProjectClearedMessage = {
	type: "EDITOR_PROJECT_CLEARED";
	requestId?: string;
};

export type EditorReadyMessage = {
	type: "EDITOR_READY";
};

export type SavedMediaItem =
	| { type: "image"; id: string }
	| { type: "clip"; id: string }
	| { type: "recording"; id: string; from: number; to: number }
	| { type: "audio"; id: string; from: number; to: number };

export type EditorMediaSavedMessage = {
	type: "EDITOR_MEDIA_SAVED";
	mediaId: string;
	mediaName: string;
	downloadToComputer: boolean;
	saveToPersonalChannel: boolean;
	selectedUnitChannelIds: string[];
	url: string;
	exportType: "mp4" | "webp";
	items: SavedMediaItem[];
};

export type EditorToParentMessage =
	| EditorPreviewItemAddedMessage
	| EditorPreviewItemRejectedMessage
	| EditorProjectClearedMessage
	| EditorReadyMessage
	| EditorMediaSavedMessage;
