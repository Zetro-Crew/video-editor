import { dispatch } from "@designcombo/events";
import type StateManager from "@designcombo/state";
import { ADD_AUDIO, ADD_VIDEO } from "@designcombo/state";
import { generateId } from "@designcombo/timeline";
import type { ITrackItem } from "@designcombo/types";
import type { PreviewItemPayload } from "@video-editor/contract/iframe/from-parent";
import { resolvePreviewSource } from "./preview-source-api";

export type ExternalMetadata = {
	sourceKind: "hls" | "mp4" | "audio";
	externalKind: "recording-range" | "media" | "audio-range";
	channelId?: string;
	mediaId?: string;
	audioId?: string;
	sourceStartTimeMs?: number;
	sourceEndTimeMs?: number;
	displayName?: string;
};

const getProjectDuration = (stateManager: StateManager) => {
	const state = stateManager.getState();
	const trackItems = Object.values(state.trackItemsMap || {}) as ITrackItem[];
	const maxDisplayTo = trackItems.reduce((max, item) => {
		const displayTo = Number.isFinite(item.display?.to) ? (item.display?.to as number) : 0;
		return Math.max(max, displayTo);
	}, 0);

	return Math.max(state.duration || 0, maxDisplayTo);
};

export const getDurationFromItem = (item: ITrackItem) => {
	const displayDuration = (item.display?.to ?? 0) - (item.display?.from ?? 0);
	return Math.max(item.duration || 0, displayDuration, 0);
};

export const buildExternalMetadata = (payload: PreviewItemPayload): ExternalMetadata => {
	if (payload.kind === "recording-range") {
		return {
			sourceKind: "hls",
			externalKind: "recording-range",
			channelId: payload.channelId,
			sourceStartTimeMs: payload.startTimeMs,
			sourceEndTimeMs: payload.endTimeMs,
			displayName: payload.name,
		};
	}

	if (payload.kind === "media") {
		return {
			sourceKind: payload.playback.kind,
			externalKind: "media",
			mediaId: payload.mediaId,
			displayName: payload.name,
		};
	}

	return {
		sourceKind: payload.playback.kind,
		externalKind: "audio-range",
		audioId: payload.audioId,
		sourceStartTimeMs: payload.startTimeMs,
		sourceEndTimeMs: payload.endTimeMs,
		displayName: payload.name,
	};
};

export const buildFallbackTrackItem = (
	itemId: string,
	insertAtMs: number,
	payload: PreviewItemPayload,
	metadata: ExternalMetadata,
	src: string,
	sourceOffsetMs: number,
): ITrackItem => {
	if (payload.kind === "audio-range") {
		return {
			id: itemId,
			type: "audio",
			name: "audio",
			display: {
				from: insertAtMs,
				to: insertAtMs + payload.durationMs,
			},
			trim: {
				from: sourceOffsetMs,
				to: sourceOffsetMs + payload.durationMs,
			},
			duration: payload.durationMs,
			details: {
				src,
			},
			metadata: {
				previewUrl: "",
				...metadata,
			},
		} as ITrackItem;
	}

	return {
		id: itemId,
		type: "video",
		name: "video",
		display: {
			from: insertAtMs,
			to: insertAtMs + (payload.durationMs ?? 0),
		},
		trim: {
			from: payload.kind === "recording-range" ? sourceOffsetMs : 0,
			to:
				payload.kind === "recording-range"
					? sourceOffsetMs + payload.durationMs
					: (payload.durationMs ?? 0),
		},
		duration: payload.durationMs,
		details: {
			src,
		},
		metadata: {
			previewUrl: payload.posterSrc || "",
			...metadata,
		},
	} as unknown as ITrackItem;
};

const appendItemState = (
	stateManager: StateManager,
	itemId: string,
	insertAtMs: number,
	payload: PreviewItemPayload,
	metadata: ExternalMetadata,
	fallbackItem: ITrackItem,
	sourceOffsetMsOverride?: number,
) => {
	const state = stateManager.getState();
	const currentItem = (state.trackItemsMap[itemId] as ITrackItem | undefined)
		? (state.trackItemsMap[itemId] as ITrackItem)
		: fallbackItem;
	const currentDuration =
		payload.kind === "media" && payload.durationMs === undefined
			? getDurationFromItem(currentItem)
			: payload.durationMs;

	const resolvedDuration = Math.max(currentDuration || 0, 0);
	const trimFrom =
		payload.kind === "recording-range" || payload.kind === "audio-range"
			? (sourceOffsetMsOverride ?? payload.sourceOffsetMs ?? 0)
			: (currentItem.trim?.from ?? 0);
	const trimTo =
		payload.kind === "recording-range" || payload.kind === "audio-range"
			? trimFrom + payload.durationMs
			: payload.kind === "media" && resolvedDuration > 0
				? trimFrom + resolvedDuration
				: (currentItem.trim?.to ?? trimFrom);
	const displayDuration =
		resolvedDuration > 0 ? resolvedDuration : getDurationFromItem(currentItem);
	const displayTo =
		displayDuration > 0 ? insertAtMs + displayDuration : (currentItem.display?.to ?? insertAtMs);

	const nextTrackItemsMap = {
		...state.trackItemsMap,
		[itemId]: {
			...currentItem,
			display: {
				from: insertAtMs,
				to: displayTo,
			},
			trim: {
				from: trimFrom,
				to: trimTo,
			},
			duration: resolvedDuration > 0 ? resolvedDuration : currentItem.duration,
			metadata: {
				...(currentItem.metadata || {}),
				...metadata,
				previewUrl: currentItem.metadata?.previewUrl || "",
			},
		},
	};

	stateManager.updateState(
		{
			trackItemsMap: nextTrackItemsMap,
			duration: Object.values(nextTrackItemsMap).reduce((max, trackItem) => {
				const displayTo = trackItem.display?.to ?? 0;
				return Math.max(max, displayTo);
			}, 0),
		},
		{
			updateHistory: false,
			kind: "update",
		},
	);
};

export const addPreviewItemToEditor = async (
	stateManager: StateManager,
	payload: PreviewItemPayload,
) => {
	const itemId = generateId();
	const insertAtMs = getProjectDuration(stateManager);
	const metadata = buildExternalMetadata(payload);

	if (payload.kind === "recording-range") {
		let hlsSrc: string;
		let resolvedSourceOffsetMs = payload.sourceOffsetMs ?? 0;
		let videoWidth = 1920;
		let videoHeight = 1080;

		if (payload.playback?.src) {
			// Fast path: Angular pre-resolved the HLS URL
			hlsSrc = payload.playback.src;
		} else {
			// Editor resolves HLS URL via POST /api/editor/preview-source
			const resolved = await resolvePreviewSource(
				payload.channelId,
				payload.startTimeMs,
				payload.endTimeMs,
			);
			hlsSrc = resolved.playlistUrl;
			videoWidth = resolved.width;
			videoHeight = resolved.height;
			// Use backend-computed sourceOffsetMs if not provided by the parent
			if (payload.sourceOffsetMs === undefined) {
				resolvedSourceOffsetMs = resolved.sourceOffsetMs;
			}
		}

		dispatch(ADD_VIDEO, {
			payload: {
				id: itemId,
				type: "video",
				name: "video",
				display: {
					from: insertAtMs,
					to: insertAtMs + payload.durationMs,
				},
				trim: {
					from: resolvedSourceOffsetMs,
					to: resolvedSourceOffsetMs + payload.durationMs,
				},
				duration: payload.durationMs,
				details: {
					src: hlsSrc,
					width: videoWidth,
					height: videoHeight,
				},
				metadata: {
					previewUrl: payload.posterSrc || "",
					...metadata,
				},
			},
			options: {
				resourceId: "main",
				scaleMode: "fit",
				isSelected: false,
			},
		});
		appendItemState(
			stateManager,
			itemId,
			insertAtMs,
			payload,
			metadata,
			buildFallbackTrackItem(itemId, insertAtMs, payload, metadata, hlsSrc, resolvedSourceOffsetMs),
			resolvedSourceOffsetMs,
		);
		return itemId;
	}

	if (payload.kind === "media") {
		dispatch(ADD_VIDEO, {
			payload: {
				id: itemId,
				type: "video",
				name: "video",
				display:
					payload.durationMs !== undefined
						? {
								from: insertAtMs,
								to: insertAtMs + payload.durationMs,
							}
						: undefined,
				trim:
					payload.durationMs !== undefined
						? {
								from: 0,
								to: payload.durationMs,
							}
						: undefined,
				duration: payload.durationMs,
				details: {
					src: payload.playback.src,
				},
				metadata: {
					previewUrl: payload.posterSrc || "",
					...metadata,
				},
			},
			options: {
				resourceId: "main",
				scaleMode: "fit",
				isSelected: false,
			},
		});
		appendItemState(
			stateManager,
			itemId,
			insertAtMs,
			payload,
			metadata,
			buildFallbackTrackItem(itemId, insertAtMs, payload, metadata, payload.playback.src, 0),
		);
		return itemId;
	}

	dispatch(ADD_AUDIO, {
		payload: {
			id: itemId,
			type: "audio",
			name: "audio",
			display: {
				from: insertAtMs,
				to: insertAtMs + payload.durationMs,
			},
			trim: {
				from: payload.sourceOffsetMs ?? 0,
				to: (payload.sourceOffsetMs ?? 0) + payload.durationMs,
			},
			duration: payload.durationMs,
			details: {
				src: payload.playback.src,
			},
			metadata: {
				previewUrl: "",
				...metadata,
			},
		},
		options: {
			isSelected: false,
		},
	});
	appendItemState(
		stateManager,
		itemId,
		insertAtMs,
		payload,
		metadata,
		buildFallbackTrackItem(
			itemId,
			insertAtMs,
			payload,
			metadata,
			payload.playback.src,
			payload.sourceOffsetMs ?? 0,
		),
	);
	return itemId;
};

export const clearProject = (stateManager: StateManager) => {
	const currentState = stateManager.getState();
	stateManager.updateState(
		{
			...currentState,
			tracks: [],
			trackItemIds: [],
			trackItemsMap: {},
			structure: [],
			activeIds: [],
			duration: 0,
		},
		{
			updateHistory: false,
			kind: "design:load",
		},
	);
};
