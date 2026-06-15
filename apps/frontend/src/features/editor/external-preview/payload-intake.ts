import { dispatch } from "@designcombo/events";
import type StateManager from "@designcombo/state";
import { ADD_AUDIO, ADD_IMAGE, ADD_VIDEO } from "@designcombo/state";
import { generateId } from "@designcombo/timeline";
import type { ITrackItem } from "@designcombo/types";
import type { PreviewItemPayload } from "@video-editor/contract/iframe/from-parent";
import { fetchCore } from "@/utils/fetch-core";
import { TRACK_APPEND_INDEX } from "../constants/constants";
import { resetEditorForNewProject } from "../state/reset-editor";
import { resolvePreviewSource } from "./preview-source-api";

const DEFAULT_IMAGE_DURATION_MS = 5000;

type StoredMediaType = "Image" | "ClipVideo" | "UploadedVideo" | "ScreenShotFromLive";

const buildStorageImageUrl = (mediaId: string): string => {
	const prefix = import.meta.env.VITE_CORE_EXTENSION ?? "";
	return `${prefix}/storage/${encodeURIComponent(mediaId)}/image`;
};

export class StoredMediaNotFoundError extends Error {
	constructor(public readonly mediaId: string) {
		super("media not found");
		this.name = "StoredMediaNotFoundError";
	}
}

export class CoreUnavailableError extends Error {
	public readonly detail?: string;
	constructor(detail?: string) {
		super("core unavailable");
		this.name = "CoreUnavailableError";
		this.detail = detail;
	}
}

interface MediaWatchResponse {
	type: StoredMediaType;
	name?: string;
}

const isStoredMediaType = (value: unknown): value is StoredMediaType =>
	value === "Image" ||
	value === "ClipVideo" ||
	value === "UploadedVideo" ||
	value === "ScreenShotFromLive";

const fetchMediaWatch = async (mediaId: string): Promise<MediaWatchResponse> => {
	let parsed: unknown;
	try {
		const response = await fetchCore(`/media/${encodeURIComponent(mediaId)}/watch`);
		if (response.status === 404) {
			throw new StoredMediaNotFoundError(mediaId);
		}
		if (!response.ok) {
			throw new CoreUnavailableError(`/media/${mediaId}/watch returned ${response.status}`);
		}
		parsed = await response.json();
	} catch (err) {
		if (err instanceof StoredMediaNotFoundError) throw err;
		if (err instanceof CoreUnavailableError) throw err;
		throw new CoreUnavailableError(err instanceof Error ? err.message : "unknown error");
	}
	if (
		!parsed ||
		typeof parsed !== "object" ||
		!("type" in parsed) ||
		!isStoredMediaType((parsed as { type: unknown }).type)
	) {
		throw new CoreUnavailableError(`/media/${mediaId}/watch returned unknown type`);
	}
	const rawName = (parsed as { name?: unknown }).name;
	return {
		type: (parsed as { type: StoredMediaType }).type,
		name: typeof rawName === "string" ? rawName : undefined,
	};
};

const headProbe = async (url: string): Promise<void> => {
	let response: Response;
	try {
		response = await fetch(url, { method: "HEAD", credentials: "include" });
	} catch (err) {
		throw new CoreUnavailableError(err instanceof Error ? err.message : "HEAD network error");
	}
	if (response.status === 404) {
		throw new StoredMediaNotFoundError(url);
	}
	if (!response.ok) {
		throw new CoreUnavailableError(`HEAD ${url} returned ${response.status}`);
	}
};

export type ExternalMetadata = {
	externalKind: "recording-range" | "audio-range" | "stored-media";
	storedMediaType?: StoredMediaType;
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
			externalKind: "recording-range",
			channelId: payload.channelId,
			sourceStartTimeMs: payload.startTimeMs,
			sourceEndTimeMs: payload.endTimeMs,
			displayName: payload.name,
		};
	}

	return {
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
	dimensions?: { width: number; height: number },
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
			from: sourceOffsetMs,
			to: sourceOffsetMs + payload.durationMs,
		},
		duration: payload.durationMs,
		details: {
			src,
			...(dimensions ?? {}),
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
	const resolvedDuration = Math.max(payload.durationMs || 0, 0);
	const trimFrom = sourceOffsetMsOverride ?? payload.sourceOffsetMs ?? 0;
	const trimTo = trimFrom + payload.durationMs;
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
			duration: Math.max(state.duration ?? 0, displayTo),
		},
		{
			updateHistory: false,
			kind: "update",
		},
	);
};

const appendStoredImageState = (
	stateManager: StateManager,
	itemId: string,
	insertAtMs: number,
	durationMs: number,
	src: string,
	metadata: ExternalMetadata,
) => {
	const state = stateManager.getState();
	const fallbackItem = {
		id: itemId,
		type: "image",
		name: "image",
		display: { from: insertAtMs, to: insertAtMs + durationMs },
		duration: durationMs,
		details: { src },
		metadata: { previewUrl: "", ...metadata },
	} as unknown as ITrackItem;

	const currentItem = (state.trackItemsMap[itemId] as ITrackItem | undefined) ?? fallbackItem;
	const displayTo = insertAtMs + durationMs;
	const nextTrackItemsMap = {
		...state.trackItemsMap,
		[itemId]: {
			...currentItem,
			display: { from: insertAtMs, to: displayTo },
			duration: durationMs,
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
			duration: Math.max(state.duration ?? 0, displayTo),
		},
		{ updateHistory: false, kind: "update" },
	);
};

const appendStoredVideoState = (
	stateManager: StateManager,
	itemId: string,
	insertAtMs: number,
	durationMs: number,
	src: string,
	dimensions: { width: number; height: number },
	metadata: ExternalMetadata,
) => {
	const state = stateManager.getState();
	const fallbackItem = {
		id: itemId,
		type: "video",
		name: "video",
		display: { from: insertAtMs, to: insertAtMs + durationMs },
		trim: { from: 0, to: durationMs },
		duration: durationMs,
		details: { src, ...dimensions },
		metadata: { previewUrl: "", ...metadata },
	} as unknown as ITrackItem;

	const currentItem = (state.trackItemsMap[itemId] as ITrackItem | undefined) ?? fallbackItem;
	const displayTo = insertAtMs + durationMs;
	const nextTrackItemsMap = {
		...state.trackItemsMap,
		[itemId]: {
			...currentItem,
			display: { from: insertAtMs, to: displayTo },
			trim: { from: 0, to: durationMs },
			duration: durationMs,
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
			duration: Math.max(state.duration ?? 0, displayTo),
		},
		{ updateHistory: false, kind: "update" },
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
			hlsSrc = payload.playback.src;
		} else {
			const resolved = await resolvePreviewSource({
				type: "channel-range",
				channelId: payload.channelId,
				startTimeMs: payload.startTimeMs,
				endTimeMs: payload.endTimeMs,
			});
			hlsSrc = resolved.playlistUrl;
			videoWidth = resolved.width;
			videoHeight = resolved.height;
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
			buildFallbackTrackItem(
				itemId,
				insertAtMs,
				payload,
				metadata,
				hlsSrc,
				resolvedSourceOffsetMs,
				{
					width: videoWidth,
					height: videoHeight,
				},
			),
			resolvedSourceOffsetMs,
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
			trackIndex: TRACK_APPEND_INDEX,
			isNewTrack: true,
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

export const addStoredMediaToEditor = async (
	stateManager: StateManager,
	mediaId: string,
): Promise<string> => {
	const watch = await fetchMediaWatch(mediaId);
	const itemId = generateId();
	const insertAtMs = getProjectDuration(stateManager);

	if (watch.type === "Image" || watch.type === "ScreenShotFromLive") {
		const durationMs = DEFAULT_IMAGE_DURATION_MS;
		const src = buildStorageImageUrl(mediaId);
		await headProbe(src);
		const metadata: ExternalMetadata = {
			externalKind: "stored-media",
			storedMediaType: watch.type,
			mediaId,
			displayName: watch.name,
		};
		dispatch(ADD_IMAGE, {
			payload: {
				id: itemId,
				type: "image",
				name: watch.name ?? "image",
				display: {
					from: insertAtMs,
					to: insertAtMs + durationMs,
				},
				duration: durationMs,
				details: { src },
				metadata: { previewUrl: "", ...metadata },
			},
			options: {
				resourceId: "main",
				scaleMode: "fit",
				isSelected: false,
			},
		});
		appendStoredImageState(stateManager, itemId, insertAtMs, durationMs, src, metadata);
		return itemId;
	}

	// ClipVideo | UploadedVideo
	let resolved: Awaited<ReturnType<typeof resolvePreviewSource>>;
	try {
		resolved = await resolvePreviewSource({ type: "media-id", mediaId });
	} catch (err) {
		const detail = err instanceof Error ? err.message : "preview-source resolution failed";
		if (detail.includes("(404)")) {
			throw new StoredMediaNotFoundError(mediaId);
		}
		throw new CoreUnavailableError(detail);
	}
	const metadata: ExternalMetadata = {
		externalKind: "stored-media",
		storedMediaType: watch.type,
		mediaId,
		displayName: watch.name,
	};
	dispatch(ADD_VIDEO, {
		payload: {
			id: itemId,
			type: "video",
			name: "video",
			display: {
				from: insertAtMs,
				to: insertAtMs + resolved.durationMs,
			},
			trim: {
				from: 0,
				to: resolved.durationMs,
			},
			duration: resolved.durationMs,
			details: {
				src: resolved.playlistUrl,
				width: resolved.width,
				height: resolved.height,
			},
			metadata: { previewUrl: "", ...metadata },
		},
		options: {
			resourceId: "main",
			scaleMode: "fit",
			isSelected: false,
		},
	});
	appendStoredVideoState(
		stateManager,
		itemId,
		insertAtMs,
		resolved.durationMs,
		resolved.playlistUrl,
		{ width: resolved.width, height: resolved.height },
		metadata,
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
	resetEditorForNewProject();
};
