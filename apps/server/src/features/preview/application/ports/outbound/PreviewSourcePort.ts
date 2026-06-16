export interface PreviewPlayResult {
	/** Full URL of the MPD document — used as anchor for RFC3986 BaseURL resolution + manifest fetch. */
	mpdUrl: string;
	/** Wall-clock timestamp (ms) of the first segment identified by startNumber. */
	segmentStartTimeMs: number;
	/** Short-lived credential — required for fetching the MPD and each segment. */
	token: string;
}

export interface MediaPlayResult {
	mpdUrl: string;
	mediaCreatedAtMs: number;
	durationMs: number;
}

export interface FetchManifestContext {
	kind: "channel-range" | "media-id";
	mediaId?: string;
	channelId?: string;
}

/**
 * Minimal logger surface used by the preview feature. Both Pino's BaseLogger and
 * Fastify's FastifyBaseLogger satisfy this structurally — keeps the application
 * layer free of framework-specific logger types.
 */
export interface PreviewLogger {
	debug(obj: object, msg?: string): void;
	info(obj: object, msg?: string): void;
	warn(obj: object, msg?: string): void;
	error(obj: object, msg?: string): void;
}

export interface PreviewSourcePort {
	play(channelId: string, startTimeMs: number, endTimeMs: number): Promise<PreviewPlayResult>;
	playMedia(mediaId: string): Promise<MediaPlayResult>;
	fetchManifest(mpdUrl: string, token?: string, context?: FetchManifestContext): Promise<string>;
}
