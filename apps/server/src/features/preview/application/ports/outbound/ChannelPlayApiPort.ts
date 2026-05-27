export interface ChannelPlayApiResult {
	mpdXml: string;
	baseUrl: string;
	segmentStartTimeMs: number;
	token?: string;
}

export interface ChannelPlayApiPort {
	fetchMpd(
		channelId: string,
		startTimeMs: number,
		endTimeMs: number,
	): Promise<ChannelPlayApiResult>;
}
