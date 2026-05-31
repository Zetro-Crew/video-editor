export interface PreviewPlayResult {
	/** Full URL of the MPD document — used as anchor for RFC3986 BaseURL resolution + manifest fetch. */
	mpdUrl: string;
	/** Wall-clock timestamp (ms) of the first segment identified by startNumber. */
	segmentStartTimeMs: number;
	/** Short-lived credential — required for fetching the MPD and each segment. */
	token: string;
}

export interface PreviewSourcePort {
	play(channelId: string, startTimeMs: number, endTimeMs: number): Promise<PreviewPlayResult>;
	fetchManifest(mpdUrl: string, token: string): Promise<string>;
}
