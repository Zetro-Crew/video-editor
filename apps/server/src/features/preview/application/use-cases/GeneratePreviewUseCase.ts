import type { EnvConfig } from "../../../../config/env.ts";
import type { StoragePort } from "../../../../shared/application/ports/outbound/StoragePort.ts";
import type { ChannelPlayApiPort } from "../ports/outbound/ChannelPlayApiPort.ts";
import { generateHlsPlaylist } from "../services/mpd-to-hls.service.ts";
import { storePreviewPlaylist } from "../services/preview-job.service.ts";

export interface GeneratePreviewInput {
	channelId: string;
	startTimeMs: number;
	endTimeMs: number;
	channelPlayApi: ChannelPlayApiPort;
}

export interface GeneratePreviewOutput {
	playlistUrl: string;
	channelId: string;
	requestedStartMs: number;
	requestedEndMs: number;
	durationMs: number;
	sourceOffsetMs: number;
	width: number;
	height: number;
}

function rewritePlaylistToProxy(playlist: string, token: string, proxyBase: string): string {
	return playlist
		.split("\n")
		.map((line) => {
			if (line.startsWith("http://") || line.startsWith("https://")) {
				const encoded = Buffer.from(line, "utf8").toString("base64url");
				return `${proxyBase}?url=${encoded}&token=${encodeURIComponent(token)}`;
			}
			const mapMatch = line.match(/^#EXT-X-MAP:URI="(https?:\/\/[^"]+)"$/);
			if (mapMatch) {
				const encoded = Buffer.from(mapMatch[1], "utf8").toString("base64url");
				return `#EXT-X-MAP:URI="${proxyBase}?url=${encoded}&token=${encodeURIComponent(token)}"`;
			}
			return line;
		})
		.join("\n");
}

export class GeneratePreviewUseCase {
	private readonly storage: StoragePort;
	private readonly config: EnvConfig;

	constructor(storage: StoragePort, config: EnvConfig) {
		this.storage = storage;
		this.config = config;
	}

	async execute(input: GeneratePreviewInput): Promise<GeneratePreviewOutput> {
		const { channelId, startTimeMs, endTimeMs, channelPlayApi } = input;

		const { mpdXml, baseUrl, segmentStartTimeMs, token } = await channelPlayApi.fetchMpd(
			channelId,
			startTimeMs,
			endTimeMs,
		);

		const {
			playlist: rawPlaylist,
			sourceOffsetMs,
			width,
			height,
		} = generateHlsPlaylist({
			mpdXml,
			baseUrl,
			segmentStartTimeMs,
			requestedStartMs: startTimeMs,
			requestedEndMs: endTimeMs,
			maxDurationMs: this.config.MAX_PREVIEW_DURATION_MS,
		});

		const playlist =
			token !== undefined
				? rewritePlaylistToProxy(
						rawPlaylist,
						token,
						`${this.config.SERVER_BASE_URL}/editor/segment`,
					)
				: rawPlaylist;

		const { playlistUrl } = await storePreviewPlaylist(
			playlist,
			this.config.S3_PREVIEW_PREFIX,
			this.storage,
			this.config.PREVIEW_JOB_TTL_SECONDS,
		);

		return {
			playlistUrl,
			channelId,
			requestedStartMs: startTimeMs,
			requestedEndMs: endTimeMs,
			durationMs: endTimeMs - startTimeMs,
			sourceOffsetMs,
			width,
			height,
		};
	}
}
