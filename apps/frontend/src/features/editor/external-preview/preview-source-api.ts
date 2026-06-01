export interface PreviewSourceResponse {
	type: "hls";
	playlistUrl: string;
	channelId: string;
	requestedStartMs: number;
	requestedEndMs: number;
	durationMs: number;
	sourceOffsetMs: number;
	width: number;
	height: number;
}

/**
 * Calls the editor backend to convert a channel recording range into an HLS playlist URL.
 * The backend fetches the MPD from the channel play API, converts it to HLS VOD, stores
 * the playlist in S3, and returns the presigned playlist URL.
 *
 * Throws on non-200 responses — callers should catch and send EDITOR_PREVIEW_ITEM_REJECTED.
 */
export const resolvePreviewSource = async (
	channelId: string,
	startTimeMs: number,
	endTimeMs: number,
): Promise<PreviewSourceResponse> => {
	const response = await fetch("/editor/preview-source", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			source: { type: "channel-range", channelId, startTimeMs, endTimeMs },
		}),
	});

	if (!response.ok) {
		const text = await response.text().catch(() => response.statusText);
		throw new Error(`Preview source resolution failed (${response.status}): ${text}`);
	}

	return response.json() as Promise<PreviewSourceResponse>;
};
