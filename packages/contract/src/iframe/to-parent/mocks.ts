import type { EditorMediaSavedMessage } from "./schemas.js";

export const mockMediaSavedMessage: EditorMediaSavedMessage = {
	type: "EDITOR_MEDIA_SAVED",
	mediaId: "550e8400-e29b-41d4-a716-446655440000",
	mediaName: "My Edited Clip",
	downloadToComputer: true,
	saveToPersonalChannel: false,
	selectedUnitChannelIds: [],
	url: "https://example.com/output/mock-video.mp4",
	exportType: "mp4",
	items: [
		{ type: "recording", id: "20574", from: 0, to: 537284 },
		{ type: "audio", id: "audio-501", from: 0, to: 537284 },
		{ type: "image", id: "img-item-1" },
		{ type: "clip", id: "media-1001" },
	],
};
