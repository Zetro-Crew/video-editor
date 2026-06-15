import { fetchServer } from "@/utils/fetch-server";

export interface PreviewSourceResponse {
	type: "hls";
	playlistUrl: string;
	durationMs: number;
	sourceOffsetMs: number;
	width: number;
	height: number;
	mediaCreatedAtMs?: number;
}

export type PreviewSourceRequest =
	| {
			type: "channel-range";
			channelId: string;
			startTimeMs: number;
			endTimeMs: number;
	  }
	| {
			type: "media-id";
			mediaId: string;
	  };

/**
 * Calls the editor backend to resolve a preview source into an HLS playlist URL.
 * For `channel-range`, backend fetches MPD from the channel play API.
 * For `media-id`, backend fetches MPD from /videos/{id}/play. Both convert to HLS VOD,
 * store the playlist in S3, and return the presigned playlist URL.
 *
 * Throws on non-200 — callers should catch and send EDITOR_PREVIEW_ITEM_REJECTED.
 */
export const resolvePreviewSource = async (
	source: PreviewSourceRequest,
): Promise<PreviewSourceResponse> => {
	const response = await fetchServer("/editor/preview-source", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ source }),
	});

	if (!response.ok) {
		const text = await response.text().catch(() => response.statusText);
		throw new Error(`Preview source resolution failed (${response.status}): ${text}`);
	}

	return response.json() as Promise<PreviewSourceResponse>;
};
