import type { ApiEnvConfig } from "../../../../config/env.ts";
import type { StoragePort } from "../../../../shared/application/ports/outbound/StoragePort.ts";
import type { PreviewSourcePort } from "../ports/outbound/PreviewSourcePort.ts";
import { generateHlsPlaylist } from "../services/mpd-to-hls.service.ts";
import { storePreviewPlaylist } from "../services/preview-job.service.ts";
import { type SrcKind, signUrl } from "../services/url-signing.ts";

export type GeneratePreviewSource =
	| {
			type: "channel-range";
			channelId: string;
			startTimeMs: number;
			endTimeMs: number;
	  }
	| {
			type: "media-id";
			mediaId: string;
	  };

export interface GeneratePreviewInput {
	source: GeneratePreviewSource;
	previewSource: PreviewSourcePort;
}

export interface GeneratePreviewOutput {
	playlistUrl: string;
	durationMs: number;
	sourceOffsetMs: number;
	width: number;
	height: number;
	mediaCreatedAtMs?: number;
}

function buildProxyUrl(
	secret: string,
	proxyBase: string,
	token: string,
	target: string,
	srcKind: SrcKind,
): string {
	const encoded = Buffer.from(target, "utf8").toString("base64url");
	const sig = signUrl(secret, target, token, srcKind);
	const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
	return `${proxyBase}?url=${encoded}&kind=${srcKind}${tokenParam}&sig=${sig}`;
}

function rewritePlaylistToProxy(
	playlist: string,
	token: string,
	proxyBase: string,
	secret: string,
	srcKind: SrcKind,
): string {
	return playlist
		.split("\n")
		.map((line) => {
			if (line.startsWith("http://") || line.startsWith("https://")) {
				return buildProxyUrl(secret, proxyBase, token, line, srcKind);
			}
			const mapMatch = line.match(/^#EXT-X-MAP:URI="(https?:\/\/[^"]+)"$/);
			if (mapMatch) {
				const proxied = buildProxyUrl(secret, proxyBase, token, mapMatch[1], srcKind);
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
		const { source, previewSource } = input;

		const proxyBase = `${this.config.SERVER_BASE_URL}${this.config.SERVER_PUBLIC_PATH_PREFIX}/editor/segment`;

		if (source.type === "channel-range") {
			const { mpdUrl, token, segmentStartTimeMs } = await previewSource.play(
				source.channelId,
				source.startTimeMs,
				source.endTimeMs,
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
				requestedStartMs: source.startTimeMs,
				requestedEndMs: source.endTimeMs,
				maxDurationMs: this.config.MAX_PREVIEW_DURATION_MS,
			});

			const playlist = rewritePlaylistToProxy(
				rawPlaylist,
				token,
				proxyBase,
				this.config.PREVIEW_SIGNING_SECRET,
				"channel-range",
			);

			const { playlistUrl } = await storePreviewPlaylist(
				playlist,
				this.config.S3_PREVIEW_PREFIX,
				this.storage,
				this.config.PREVIEW_JOB_TTL_SECONDS,
			);

			return {
				playlistUrl,
				durationMs: source.endTimeMs - source.startTimeMs,
				sourceOffsetMs,
				width,
				height,
			};
		}

		// source.type === "media-id"
		const { mpdUrl, mediaCreatedAtMs, durationMs } = await previewSource.playMedia(source.mediaId);
		const mpdXml = await previewSource.fetchManifest(mpdUrl);

		const requestedStartMs = mediaCreatedAtMs;
		const requestedEndMs = mediaCreatedAtMs + durationMs;
		const {
			playlist: rawPlaylist,
			sourceOffsetMs,
			width,
			height,
		} = generateHlsPlaylist({
			mpdXml,
			mpdUrl,
			segmentStartTimeMs: mediaCreatedAtMs,
			requestedStartMs,
			requestedEndMs,
			maxDurationMs: this.config.MAX_PREVIEW_DURATION_MS,
		});

		if (width <= 0 || height <= 0) {
			throw new RangeError("playlist missing video dimensions");
		}

		const playlist = rewritePlaylistToProxy(
			rawPlaylist,
			"",
			proxyBase,
			this.config.PREVIEW_SIGNING_SECRET,
			"media-id",
		);

		const { playlistUrl } = await storePreviewPlaylist(
			playlist,
			this.config.S3_PREVIEW_PREFIX,
			this.storage,
			this.config.PREVIEW_JOB_TTL_SECONDS,
		);

		return {
			playlistUrl,
			durationMs,
			sourceOffsetMs,
			width,
			height,
			mediaCreatedAtMs,
		};
	}
}
