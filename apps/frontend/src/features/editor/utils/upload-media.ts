import { dispatch } from "@designcombo/events";
import { ADD_AUDIO, ADD_IMAGE, ADD_VIDEO } from "@designcombo/state";
import { generateId } from "@designcombo/timeline";
import { TRACK_APPEND_INDEX } from "../constants/constants";

export function getUploadAssetUrl(upload: any) {
	return upload?.metadata?.uploadedUrl || upload?.url || "";
}

export function getMediaDurationMs(src: string, kind: "video" | "audio"): Promise<number> {
	return new Promise((resolve) => {
		const el = document.createElement(kind);
		el.preload = "metadata";
		const done = (ms: number) => {
			el.src = "";
			resolve(ms);
		};
		el.onloadedmetadata = () =>
			done(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : 0);
		el.onerror = () => done(0);
		el.src = src;
	});
}

export async function autoAddUploadedMedia(upload: any) {
	const src = getUploadAssetUrl(upload);
	const mediaType = upload?.type;

	if (!src || !mediaType) return;

	if (mediaType === "video" || mediaType?.startsWith?.("video/")) {
		const durationMs = await getMediaDurationMs(src, "video");
		if (!durationMs) throw new Error("Could not determine video duration");
		dispatch(ADD_VIDEO, {
			payload: {
				id: generateId(),
				type: "video",
				display: { from: 0, to: durationMs },
				trim: { from: 0, to: durationMs },
				duration: durationMs,
				details: { src },
				metadata: { previewUrl: "" },
			},
			options: {
				resourceId: "main",
				scaleMode: "fit",
			},
		});
		return;
	}

	if (mediaType === "image" || mediaType?.startsWith?.("image/")) {
		dispatch(ADD_IMAGE, {
			payload: {
				id: generateId(),
				type: "image",
				display: {
					from: 0,
					to: 5000,
				},
				details: {
					src,
				},
				metadata: {},
			},
			options: {},
		});
		return;
	}

	if (mediaType === "audio" || mediaType?.startsWith?.("audio/")) {
		const durationMs = await getMediaDurationMs(src, "audio");
		if (!durationMs) throw new Error("Could not determine audio duration");
		dispatch(ADD_AUDIO, {
			payload: {
				id: generateId(),
				type: "audio",
				display: { from: 0, to: durationMs },
				trim: { from: 0, to: durationMs },
				duration: durationMs,
				details: { src },
				metadata: {},
			},
			options: { trackIndex: TRACK_APPEND_INDEX, isNewTrack: true },
		});
	}
}
