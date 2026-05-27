import type {
	ChannelPlayApiPort,
	ChannelPlayApiResult,
} from "../../../application/ports/outbound/ChannelPlayApiPort.ts";
import {
	DEMO_PREVIEW_CHANNEL_ID,
	loadDemoPreviewFixture,
} from "../../../application/services/demo-preview.fixture.ts";

export class DemoChannelPlayApiAdapter implements ChannelPlayApiPort {
	private readonly serverBaseUrl: string;

	constructor(serverBaseUrl: string) {
		this.serverBaseUrl = serverBaseUrl;
	}

	async fetchMpd(
		channelId: string,
		startTimeMs: number,
		endTimeMs: number,
	): Promise<ChannelPlayApiResult> {
		if (channelId !== DEMO_PREVIEW_CHANNEL_ID) {
			throw new Error(`DemoChannelPlayApiAdapter only handles ${DEMO_PREVIEW_CHANNEL_ID}`);
		}

		const fixture = loadDemoPreviewFixture(this.serverBaseUrl);

		if (startTimeMs < fixture.segmentStartTimeMs || endTimeMs > fixture.endTimeMs) {
			throw new RangeError(
				`Demo recording supports ${fixture.segmentStartTimeMs} <= time < ${fixture.endTimeMs}`,
			);
		}

		return {
			mpdXml: fixture.mpdXml,
			baseUrl: fixture.baseUrl,
			segmentStartTimeMs: fixture.segmentStartTimeMs,
		};
	}
}
