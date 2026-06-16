import type {
	FetchManifestContext,
	MediaPlayResult,
	PreviewLogger,
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
const BODY_SNIPPET_MAX = 200;

async function readBodySnippet(res: Response): Promise<string> {
	try {
		const text = await res.clone().text();
		return text.slice(0, BODY_SNIPPET_MAX);
	} catch {
		return "";
	}
}

export class HttpPreviewSourceAdapter implements PreviewSourcePort {
	private readonly coreBaseUrl: string;
	private readonly serverBaseUrl: string;
	private readonly authCookie: string;
	private readonly logger: PreviewLogger;

	constructor(config: {
		coreBaseUrl: string;
		serverBaseUrl: string;
		authCookie?: string;
		logger: PreviewLogger;
	}) {
		this.coreBaseUrl = config.coreBaseUrl;
		this.serverBaseUrl = config.serverBaseUrl;
		this.authCookie = config.authCookie || "";
		this.logger = config.logger;
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
		this.logger.debug({ playUrl, channelId }, "core play request");

		let res: Response;
		try {
			res = await fetch(playUrl, {
				headers: this.cookieHeader(),
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
		} catch (err) {
			this.logger.error(
				{ err, playUrl, channelId, coreBaseUrl: this.coreBaseUrl },
				"core play failed",
			);
			throw new Error("core play failed", { cause: err });
		}

		if (res.status === 404) {
			throw new RangeError(
				`Channel play API returned 404 for channel ${channelId} (range [${startTimeMs}, ${endTimeMs}] unavailable)`,
			);
		}
		if (!res.ok) {
			this.logger.warn(
				{
					playUrl,
					channelId,
					status: res.status,
					bodySnippet: await readBodySnippet(res),
				},
				"core play non-2xx",
			);
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

		this.logger.debug(
			{
				channelId,
				status: res.status,
				mpdUrl,
				hasToken: !!play.token,
				rangeCount: play.timeRanges.length,
			},
			"core play ok",
		);

		return {
			mpdUrl,
			token: play.token,
			segmentStartTimeMs: range[0],
		};
	}

	async playMedia(mediaId: string): Promise<MediaPlayResult> {
		const playUrl = `${this.coreBaseUrl}/videos/${encodeURIComponent(mediaId)}/play`;
		this.logger.debug({ playUrl, mediaId }, "core videos play request");

		let res: Response;
		try {
			res = await fetch(playUrl, {
				headers: this.cookieHeader(),
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
		} catch (err) {
			this.logger.error(
				{ err, playUrl, mediaId, coreBaseUrl: this.coreBaseUrl },
				"core videos play failed",
			);
			throw new Error("core videos play failed", { cause: err });
		}

		if (res.status === 404) {
			throw new RangeError(`Video play API returned 404 for media ${mediaId}`);
		}
		if (!res.ok) {
			this.logger.warn(
				{
					playUrl,
					mediaId,
					status: res.status,
					bodySnippet: await readBodySnippet(res),
				},
				"core videos play non-2xx",
			);
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
		const durationMs = range[1] - range[0];

		this.logger.debug(
			{
				mediaId,
				status: res.status,
				mpdUrl,
				rangeCount: play.timeRanges.length,
				durationMs,
			},
			"core videos play ok",
		);

		return {
			mpdUrl,
			mediaCreatedAtMs: range[0],
			durationMs,
		};
	}

	async fetchManifest(
		mpdUrl: string,
		token?: string,
		context?: FetchManifestContext,
	): Promise<string> {
		const headers: Record<string, string> = { ...this.cookieHeader() };
		if (token) headers["vod-token"] = token;

		const ctxFields = {
			kind: context?.kind,
			mediaId: context?.mediaId,
			channelId: context?.channelId,
		};

		this.logger.debug({ mpdUrl, ...ctxFields }, "vod fetchManifest request");

		let res: Response;
		try {
			res = await fetch(mpdUrl, {
				headers,
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
		} catch (err) {
			this.logger.error({ err, mpdUrl, ...ctxFields }, "vod fetchManifest failed");
			throw new Error("vod fetchManifest failed", { cause: err });
		}

		if (!res.ok) {
			this.logger.warn(
				{
					mpdUrl,
					status: res.status,
					bodySnippet: await readBodySnippet(res),
					...ctxFields,
				},
				"vod fetchManifest non-2xx",
			);
			throw new Error(`MPD fetch returned ${res.status}`);
		}

		const text = await res.text();
		this.logger.debug(
			{ mpdUrl, status: res.status, byteLength: text.length, ...ctxFields },
			"vod fetchManifest ok",
		);
		return text;
	}
}
