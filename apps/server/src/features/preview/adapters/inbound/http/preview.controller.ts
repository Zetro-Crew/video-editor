import {
	type PreviewSourceBody,
	previewSourceRequestSchema,
	type SegmentQuery,
	segmentRequestSchema,
} from "@video-editor/contract/internal/preview";
import { HttpError } from "@ztube/observability/fastify";
import type { FastifyPluginAsync } from "fastify";
import type { ApiEnvConfig } from "../../../../../config/env.ts";
import type { Request } from "../../../../../infrastructure/fastify/fastify.ts";
import type { StoragePort } from "../../../../../shared/application/ports/outbound/StoragePort.ts";
import { HttpStatus } from "../../../../../shared/utils/http-status.ts";
import { verifyUrlSignature } from "../../../application/services/url-signing.ts";
import {
	type GeneratePreviewSource,
	GeneratePreviewUseCase,
} from "../../../application/use-cases/GeneratePreviewUseCase.ts";
import { HttpPreviewSourceAdapter } from "../../outbound/http/HttpPreviewSourceAdapter.ts";

interface PreviewControllerOptions {
	storage: StoragePort;
	config: ApiEnvConfig;
}

function parseZtubeTokenCookie(cookieHeader: string): string {
	const cookieMatch = cookieHeader.match(/(?:^|;\s*)ztube-token=([^;]+)/);
	if (!cookieMatch) return "";
	try {
		return decodeURIComponent(cookieMatch[1]);
	} catch (err) {
		if (err instanceof URIError) {
			throw new HttpError({
				statusCode: HttpStatus.BAD_REQUEST,
				message: "Invalid ztube-token cookie",
			});
		}
		throw err;
	}
}

export const previewController: FastifyPluginAsync<PreviewControllerOptions> = async (
	fastify,
	opts,
): Promise<void> => {
	const { config, storage } = opts;
	const generatePreviewUseCase = new GeneratePreviewUseCase(storage, config);

	fastify.get(
		"/editor/segment",
		{ schema: { ...segmentRequestSchema, hide: true } },
		async (request: Request<unknown, SegmentQuery>, reply) => {
			const { url, token, sig, kind } = request.query;
			const effectiveToken = token ?? "";
			if (kind === "channel-range" && !effectiveToken) {
				throw new HttpError({
					statusCode: HttpStatus.BAD_REQUEST,
					message: "Missing token for channel-range",
				});
			}

			if (!/^[A-Za-z0-9_=-]*$/.test(url) || !/^[A-Za-z0-9_-]+$/.test(sig)) {
				throw new HttpError({
					statusCode: HttpStatus.BAD_REQUEST,
					message: "Invalid url encoding",
				});
			}

			const decoded = Buffer.from(url, "base64url").toString("utf8");

			if (decoded.includes("\x00")) {
				throw new HttpError({
					statusCode: HttpStatus.BAD_REQUEST,
					message: "Invalid url encoding",
				});
			}

			let parsed: URL;
			try {
				parsed = new URL(decoded);
			} catch {
				throw new HttpError({ statusCode: HttpStatus.BAD_REQUEST, message: "Invalid URL" });
			}
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				throw new HttpError({ statusCode: HttpStatus.BAD_REQUEST, message: "Invalid URL" });
			}

			if (!verifyUrlSignature(config.PREVIEW_SIGNING_SECRET, decoded, effectiveToken, kind, sig)) {
				throw new HttpError({ statusCode: HttpStatus.FORBIDDEN, message: "Invalid signature" });
			}

			const ztubeToken = parseZtubeTokenCookie(request.headers.cookie ?? "");

			const clientAbort = new AbortController();
			const onAborted = () => clientAbort.abort();
			request.raw.once("aborted", onAborted);
			const upstreamSignal = AbortSignal.any([clientAbort.signal, AbortSignal.timeout(30_000)]);

			const upstreamHeaders: Record<string, string> = {};
			if (kind === "channel-range") upstreamHeaders["vod-token"] = effectiveToken;
			if (ztubeToken) upstreamHeaders.Cookie = `ztube-token=${ztubeToken}`;

			let upstream: Response;
			try {
				upstream = await fetch(decoded, {
					headers: upstreamHeaders,
					signal: upstreamSignal,
				});
			} catch (err) {
				request.raw.removeListener("aborted", onAborted);
				if (clientAbort.signal.aborted) return;
				if (err instanceof Error && err.name === "TimeoutError") {
					throw new HttpError({
						statusCode: HttpStatus.GATEWAY_TIMEOUT,
						message: "Upstream timeout",
					});
				}
				throw err;
			}

			if (!upstream.ok) {
				throw new HttpError({
					statusCode: upstream.status,
					message: `Upstream segment fetch failed (${upstream.status})`,
					details: { upstreamStatus: upstream.status },
				});
			}

			reply.header("Content-Type", upstream.headers.get("content-type") ?? "video/mp4");
			return reply.send(upstream.body);
		},
	);

	fastify.post(
		"/editor/preview-source",
		{ schema: previewSourceRequestSchema },
		async (request: Request<PreviewSourceBody>, reply) => {
			const { source } = request.body;

			let useCaseSource: GeneratePreviewSource;
			if (source.type === "channel-range") {
				const { channelId, startTimeMs, endTimeMs } = source;
				if (endTimeMs <= startTimeMs) {
					throw new HttpError({
						statusCode: HttpStatus.BAD_REQUEST,
						message: "endTimeMs must be greater than startTimeMs",
					});
				}

				const durationMs = endTimeMs - startTimeMs;
				if (durationMs > config.MAX_PREVIEW_DURATION_MS) {
					throw new HttpError({
						statusCode: HttpStatus.BAD_REQUEST,
						message: `Requested duration exceeds maximum of ${config.MAX_PREVIEW_DURATION_MS}ms`,
					});
				}
				useCaseSource = { type: "channel-range", channelId, startTimeMs, endTimeMs };
			} else {
				useCaseSource = { type: "media-id", mediaId: source.mediaId };
			}

			request.log.info(
				{
					kind: source.type,
					mediaId: source.type === "media-id" ? source.mediaId : undefined,
					channelId: source.type === "channel-range" ? source.channelId : undefined,
					startTimeMs: source.type === "channel-range" ? source.startTimeMs : undefined,
					endTimeMs: source.type === "channel-range" ? source.endTimeMs : undefined,
				},
				"preview-source request",
			);

			const ztubeToken = parseZtubeTokenCookie(request.headers.cookie ?? "");
			const previewSource = new HttpPreviewSourceAdapter({
				coreBaseUrl: config.CORE_BASE_URL,
				serverBaseUrl: config.SERVER_BASE_URL,
				authCookie: ztubeToken,
				logger: request.log,
			});

			try {
				const result = await generatePreviewUseCase.execute(
					{
						source: useCaseSource,
						previewSource,
					},
					{ logger: request.log },
				);

				request.log.info(
					{
						kind: source.type,
						durationMs: result.durationMs,
						sourceOffsetMs: result.sourceOffsetMs,
						width: result.width,
						height: result.height,
					},
					"preview-source ok",
				);

				return reply.status(HttpStatus.OK).send({ type: "hls", ...result });
			} catch (err) {
				if (err instanceof RangeError) {
					throw new HttpError({ statusCode: HttpStatus.BAD_REQUEST, message: err.message });
				}
				throw err;
			}
		},
	);
};
