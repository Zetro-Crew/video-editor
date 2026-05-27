import type {
	ChannelPlayApiPort,
	ChannelPlayApiResult,
} from "../../../application/ports/outbound/ChannelPlayApiPort.ts";

interface ChannelPlayResponse {
	url: string;
	timeRanges: number[][];
	token: string;
}

export class HttpChannelPlayApiAdapter implements ChannelPlayApiPort {
	private readonly baseUrl: string;
	private readonly authCookie: string;

	constructor(baseUrl: string, authCookie = "") {
		this.baseUrl = baseUrl;
		this.authCookie = authCookie;
	}

	async fetchMpd(
		channelId: string,
		startTimeMs: number,
		endTimeMs: number,
	): Promise<ChannelPlayApiResult> {
		const playUrl = `${this.baseUrl}/channels/${channelId}/play?start=${startTimeMs}&end=${endTimeMs}`;
		const playRes = await fetch(playUrl, {
			headers: this.authCookie ? { Cookie: `ztube-token=${this.authCookie}` } : {},
		});
		if (!playRes.ok) {
			throw new Error(`Channel play API returned ${playRes.status} for channel ${channelId}`);
		}
		const play = (await playRes.json()) as ChannelPlayResponse;

		const origin = new URL(this.baseUrl).origin;
		const relativePath = play.url.startsWith("/") ? play.url : `/${play.url}`;
		const generateUrl = `${origin}${relativePath}`;
		const genRes = await fetch(generateUrl, {
			headers: {
				"vod-token": play.token,
				Cookie: `ztube-token=${this.authCookie}`,
			},
		});
		if (!genRes.ok) {
			throw new Error(`Generate API returned ${genRes.status}`);
		}
		const mpdXml = await genRes.text();
		const segmentStartTimeMs = play.timeRanges[0][0];

		return { mpdXml, baseUrl: origin, segmentStartTimeMs, token: play.token };
	}
}
