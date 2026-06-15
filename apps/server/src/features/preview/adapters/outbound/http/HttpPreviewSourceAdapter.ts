import type {
	MediaPlayResult,
	PreviewPlayResult,
	PreviewSourcePort,
} from "../../../application/ports/outbound/PreviewSourcePort.ts";

interface ChannelPlayResponse {
	url: string;
	timeRanges: number[][];
	token: string;
}

interface VideoPlayResponse {
	url: string;
	timeRanges: number[][];
}

const FETCH_TIMEOUT_MS = 10_000;

export class HttpPreviewSourceAdapter implements PreviewSourcePort {
	private readonly coreBaseUrl: string;
	private readonly serverBaseUrl: string;
	private readonly authCookie: string;

	constructor(config: { coreBaseUrl: string; serverBaseUrl: string; authCookie?: string }) {
		this.coreBaseUrl = config.coreBaseUrl;
		this.serverBaseUrl = config.serverBaseUrl;
		this.authCookie = config.authCookie || "";
	}

	private cookieHeader(): Record<string, string> {
		return this.authCookie ? { Cookie: `ztube-token=${this.authCookie}` } : {};
	}

	async play(
		channelId: string,
		startTimeMs: number,
		endTimeMs: number,
	): Promise<PreviewPlayResult> {
		const playUrl = `${this.coreBaseUrl}/channels/${encodeURIComponent(channelId)}/play?start=${startTimeMs}&end=${endTimeMs}`;
		const res = await fetch(playUrl, {
			headers: this.cookieHeader(),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (res.status === 404) {
			throw new RangeError(
				`Channel play API returned 404 for channel ${channelId} (range [${startTimeMs}, ${endTimeMs}] unavailable)`,
			);
		}
		if (!res.ok) {
			throw new Error(`Channel play API returned ${res.status} for channel ${channelId}`);
		}
		const play = (await res.json()) as ChannelPlayResponse;

		if (!Array.isArray(play.timeRanges) || play.timeRanges.length !== 1) {
			throw new Error(
				`multi-range recordings not supported (got ${play.timeRanges?.length ?? 0} ranges)`,
			);
		}
		const [range] = play.timeRanges;
		if (!Array.isArray(range) || typeof range[0] !== "number" || !Number.isFinite(range[0])) {
			throw new Error("Channel play API returned malformed timeRanges entry");
		}
		if (!play.token) {
			throw new Error("Channel play API returned no token");
		}
		if (typeof play.url !== "string" || !play.url) {
			throw new Error("Channel play API returned no url");
		}

		// play.url may be relative (prod: "/api/vod/generate" → resolved against serverBaseUrl)
		const mpdUrl = new URL(play.url, this.serverBaseUrl).toString();

		return {
			mpdUrl,
			token: play.token,
			segmentStartTimeMs: range[0],
		};
	}

	async playMedia(mediaId: string): Promise<MediaPlayResult> {
		const playUrl = `${this.coreBaseUrl}/videos/${encodeURIComponent(mediaId)}/play`;
		const res = await fetch(playUrl, {
			headers: this.cookieHeader(),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (res.status === 404) {
			throw new RangeError(`Video play API returned 404 for media ${mediaId}`);
		}
		if (!res.ok) {
			throw new Error(`Video play API returned ${res.status} for media ${mediaId}`);
		}
		const play = (await res.json()) as VideoPlayResponse;

		if (!Array.isArray(play.timeRanges) || play.timeRanges.length !== 1) {
			throw new Error(
				`multi-range videos not supported (got ${play.timeRanges?.length ?? 0} ranges)`,
			);
		}
		const [range] = play.timeRanges;
		if (
			!Array.isArray(range) ||
			range.length !== 2 ||
			typeof range[0] !== "number" ||
			typeof range[1] !== "number" ||
			!Number.isFinite(range[0]) ||
			!Number.isFinite(range[1])
		) {
			throw new Error("Video play API returned malformed timeRanges entry");
		}
		if (range[1] <= range[0]) {
			throw new Error("Video play API timeRanges[0][1] must be > timeRanges[0][0]");
		}
		if (typeof play.url !== "string" || !play.url) {
			throw new Error("Video play API returned no url");
		}

		const mpdUrl = new URL(play.url, this.serverBaseUrl).toString();

		return {
			mpdUrl,
			mediaCreatedAtMs: range[0],
			durationMs: range[1] - range[0],
		};
	}

	async fetchManifest(mpdUrl: string, token?: string): Promise<string> {
		const headers: Record<string, string> = { ...this.cookieHeader() };
		if (token) headers["vod-token"] = token;
		const res = await fetch(mpdUrl, {
			headers,
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!res.ok) {
			throw new Error(`MPD fetch returned ${res.status}`);
		}
		return await res.text();
	}
}
