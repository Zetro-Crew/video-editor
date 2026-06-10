import type { FastifyPluginAsync } from "fastify";
import type { ApiEnvConfig } from "../../../../../config/env.ts";
import type { StoragePort } from "../../../../../shared/application/ports/outbound/StoragePort.ts";
import { HttpStatus } from "../../../../../shared/utils/http-status.ts";
import { verifyUrlSignature } from "../../../application/services/url-signing.ts";
import { GeneratePreviewUseCase } from "../../../application/use-cases/GeneratePreviewUseCase.ts";
import { HttpPreviewSourceAdapter } from "../../outbound/http/HttpPreviewSourceAdapter.ts";

interface ChannelRangeSource {
	type: "channel-range";
	channelId: string;
	startTimeMs: number;
	endTimeMs: number;
}

interface PreviewSourceBody {
	source: ChannelRangeSource;
}

interface PreviewControllerOptions {
	storage: StoragePort;
	config: ApiEnvConfig;
}

export const previewController: FastifyPluginAsync<PreviewControllerOptions> = async (
	fastify,
	opts,
): Promise<void> => {
	const { config, storage } = opts;
	const generatePreviewUseCase = new GeneratePreviewUseCase(storage, config);

	fastify.get("/editor/segment", async (request, reply) => {
		const { url, token, sig } = request.query as {
			url?: string;
			token?: string;
			sig?: string;
		};
		if (!url || !token || !sig) {
			return reply.status(HttpStatus.BAD_REQUEST).send({ error: "Missing url, token, or sig" });
		}

		if (!/^[A-Za-z0-9_=-]*$/.test(url) || !/^[A-Za-z0-9_-]+$/.test(sig)) {
			return reply.status(HttpStatus.BAD_REQUEST).send({ error: "Invalid url encoding" });
		}

		const decoded = Buffer.from(url, "base64url").toString("utf8");

		if (decoded.includes("\x00")) {
			return reply.status(HttpStatus.BAD_REQUEST).send({ error: "Invalid url encoding" });
		}

		let parsed: URL;
		try {
			parsed = new URL(decoded);
		} catch {
			return reply.status(HttpStatus.BAD_REQUEST).send({ error: "Invalid URL" });
		}
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return reply.status(HttpStatus.BAD_REQUEST).send({ error: "Invalid URL" });
		}

		if (!verifyUrlSignature(config.PREVIEW_SIGNING_SECRET, decoded, token, sig)) {
			return reply.status(HttpStatus.FORBIDDEN).send({ error: "Invalid signature" });
		}

		const clientAbort = new AbortController();
		const onAborted = () => clientAbort.abort();
		request.raw.once("aborted", onAborted);
		const upstreamSignal = AbortSignal.any([clientAbort.signal, AbortSignal.timeout(30_000)]);

		let upstream: Response;
		try {
			upstream = await fetch(decoded, {
				headers: { "vod-token": token },
				signal: upstreamSignal,
			});
		} catch (err) {
			request.raw.removeListener("aborted", onAborted);
			if (clientAbort.signal.aborted) return;
			if (err instanceof Error && err.name === "TimeoutError") {
				return reply.status(HttpStatus.GATEWAY_TIMEOUT).send({ error: "Upstream timeout" });
			}
			throw err;
		}

		if (!upstream.ok) {
			return reply.status(upstream.status).send();
		}

		reply.header("Content-Type", upstream.headers.get("content-type") ?? "video/mp4");
		return reply.send(upstream.body);
	});

	fastify.post<{ Body: PreviewSourceBody }>("/editor/preview-source", async (request, reply) => {
		const body = request.body as PreviewSourceBody | null;
		if (!body?.source || body.source.type !== "channel-range") {
			return reply
				.status(HttpStatus.BAD_REQUEST)
				.send({ error: "source.type must be channel-range" });
		}
		const { source } = body;

		const { channelId, startTimeMs, endTimeMs } = source;

		if (endTimeMs <= startTimeMs) {
			return reply
				.status(HttpStatus.BAD_REQUEST)
				.send({ error: "endTimeMs must be greater than startTimeMs" });
		}

		const durationMs = endTimeMs - startTimeMs;
		if (durationMs > config.MAX_PREVIEW_DURATION_MS) {
			return reply.status(HttpStatus.BAD_REQUEST).send({
				error: `Requested duration exceeds maximum of ${config.MAX_PREVIEW_DURATION_MS}ms`,
			});
		}

		const cookieHeader = request.headers.cookie ?? "";
		const cookieMatch = cookieHeader.match(/(?:^|;\s*)ztube-token=([^;]+)/);
		let ztubeToken = "";
		if (cookieMatch) {
			try {
				ztubeToken = decodeURIComponent(cookieMatch[1]);
			} catch (err) {
				if (err instanceof URIError) {
					return reply.status(HttpStatus.BAD_REQUEST).send({ error: "Invalid ztube-token cookie" });
				}
				throw err;
			}
		}
		const previewSource = new HttpPreviewSourceAdapter({
			coreBaseUrl: config.CORE_BASE_URL,
			serverBaseUrl: config.SERVER_BASE_URL,
			authCookie: ztubeToken,
		});

		try {
			const result = await generatePreviewUseCase.execute({
				channelId,
				startTimeMs,
				endTimeMs,
				previewSource,
			});

			return reply.status(HttpStatus.OK).send({ type: "hls", ...result });
		} catch (err) {
			if (err instanceof RangeError) {
				return reply.status(HttpStatus.BAD_REQUEST).send({ error: err.message });
			}
			throw err;
		}
	});
};
