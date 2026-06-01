import type {
	PreviewPlayResult,
	PreviewSourcePort,
} from "../../../application/ports/outbound/PreviewSourcePort.ts";

interface ChannelPlayResponse {
	url: string;
	timeRanges: number[][];
	token: string;
}

const FETCH_TIMEOUT_MS = 10_000;

export class HttpPreviewSourceAdapter implements PreviewSourcePort {
	private readonly coreBaseUrl: string;
	private readonly authCookie: string;

	constructor(coreBaseUrl: string, authCookie = "") {
		this.coreBaseUrl = coreBaseUrl;
		this.authCookie = authCookie;
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

		// play.url may be relative (prod: "/api/vod/generate" → resolved against coreBaseUrl)
		// OR absolute (dev mock: "http://localhost:5050/vod/<id>/manifest.mpd"). new URL handles both.
		const mpdUrl = new URL(play.url, this.coreBaseUrl).toString();

		return {
			mpdUrl,
			token: play.token,
			segmentStartTimeMs: range[0],
		};
	}

	async fetchManifest(mpdUrl: string, token: string): Promise<string> {
		// VOD is a different trust boundary from Core — do NOT forward the Core ztube-token cookie.
		const res = await fetch(mpdUrl, {
			headers: { "vod-token": token },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!res.ok) {
			throw new Error(`MPD fetch returned ${res.status}`);
		}
		return await res.text();
	}
}
