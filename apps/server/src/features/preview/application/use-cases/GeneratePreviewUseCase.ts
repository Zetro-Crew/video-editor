import type { ApiEnvConfig } from "../../../../config/env.ts";
import type { StoragePort } from "../../../../shared/application/ports/outbound/StoragePort.ts";
import type { PreviewSourcePort } from "../ports/outbound/PreviewSourcePort.ts";
import { generateHlsPlaylist } from "../services/mpd-to-hls.service.ts";
import { storePreviewPlaylist } from "../services/preview-job.service.ts";
import { signUrl } from "../services/url-signing.ts";

export interface GeneratePreviewInput {
	channelId: string;
	startTimeMs: number;
	endTimeMs: number;
	previewSource: PreviewSourcePort;
	ztubeToken?: string;
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

function buildProxyUrl(secret: string, proxyBase: string, token: string, target: string): string {
	const encoded = Buffer.from(target, "utf8").toString("base64url");
	const sig = signUrl(secret, target, token);
	return `${proxyBase}?url=${encoded}&token=${encodeURIComponent(token)}&sig=${sig}`;
}

function rewritePlaylistToProxy(
	playlist: string,
	token: string,
	proxyBase: string,
	secret: string,
): string {
	return playlist
		.split("\n")
		.map((line) => {
			if (line.startsWith("http://") || line.startsWith("https://")) {
				return buildProxyUrl(secret, proxyBase, token, line);
			}
			const mapMatch = line.match(/^#EXT-X-MAP:URI="(https?:\/\/[^"]+)"$/);
			if (mapMatch) {
				const proxied = buildProxyUrl(secret, proxyBase, token, mapMatch[1]);
				return `#EXT-X-MAP:URI="${proxied}"`;
			}
			return line;
		})
		.join("\n");
}

export class GeneratePreviewUseCase {
	private readonly storage: StoragePort;
	private readonly config: ApiEnvConfig;

	constructor(storage: StoragePort, config: ApiEnvConfig) {
		this.storage = storage;
		this.config = config;
	}

	async execute(input: GeneratePreviewInput): Promise<GeneratePreviewOutput> {
		const { channelId, startTimeMs, endTimeMs, previewSource } = input;

		const { mpdUrl, token, segmentStartTimeMs } = await previewSource.play(
			channelId,
			startTimeMs,
			endTimeMs,
		);
		const mpdXml = await previewSource.fetchManifest(mpdUrl, token);

		const {
			playlist: rawPlaylist,
			sourceOffsetMs,
			width,
			height,
		} = generateHlsPlaylist({
			mpdXml,
			mpdUrl,
			segmentStartTimeMs,
			requestedStartMs: startTimeMs,
			requestedEndMs: endTimeMs,
			maxDurationMs: this.config.MAX_PREVIEW_DURATION_MS,
		});

		const playlist = rewritePlaylistToProxy(
			rawPlaylist,
			token,
			`${this.config.SERVER_BASE_URL}/editor/segment`,
			this.config.PREVIEW_SIGNING_SECRET,
		);

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
