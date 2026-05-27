import { promises as fsp } from "node:fs";
import path from "node:path";
import type { FastifyPluginAsync } from "fastify";
import type { EnvConfig } from "../../../../../config/env.ts";
import type { StoragePort } from "../../../../../shared/application/ports/outbound/StoragePort.ts";
import { HttpStatus } from "../../../../../shared/utils/http-status.ts";
import type { ChannelPlayApiPort } from "../../../application/ports/outbound/ChannelPlayApiPort.ts";
import {
	DEMO_PREVIEW_CHANNEL_ID,
	getDemoPreviewAssetsDir,
} from "../../../application/services/demo-preview.fixture.ts";
import { GeneratePreviewUseCase } from "../../../application/use-cases/GeneratePreviewUseCase.ts";
import { DemoChannelPlayApiAdapter } from "../../outbound/demo/DemoChannelPlayApiAdapter.ts";
import { HttpChannelPlayApiAdapter } from "../../outbound/http/HttpChannelPlayApiAdapter.ts";

interface ChannelRangeSource {
	type: "channel-range";
	channelId: string;
	startTimeMs: number;
	endTimeMs: number;
}

interface PreviewSourceBody {
	source: ChannelRangeSource;
	mpdXml?: string;
	mpdBaseUrl?: string;
	segmentStartTimeMs?: number;
}

interface PreviewControllerOptions {
	storage: StoragePort;
	config: EnvConfig;
}

export const previewController: FastifyPluginAsync<PreviewControllerOptions> = async (
	fastify,
	opts,
): Promise<void> => {
	const { config, storage } = opts;
	const generatePreviewUseCase = new GeneratePreviewUseCase(storage, config);

	fastify.get("/editor/demo-assets/:filename", async (request, reply) => {
		const { filename } = request.params as { filename?: string };
		if (!filename || path.basename(filename) !== filename) {
			return reply.status(HttpStatus.BAD_REQUEST).send({ error: "Invalid demo asset filename" });
		}

		const filePath = path.join(getDemoPreviewAssetsDir(), filename);
		try {
			const body = await fsp.readFile(filePath);
			const extension = path.extname(filename).toLowerCase();
			const contentType =
				extension === ".mpd"
					? "application/dash+xml"
					: extension === ".m4s"
						? "video/iso.segment"
						: "video/mp4";
			reply.header("Content-Type", contentType);
			return reply.send(body);
		} catch {
			return reply.status(HttpStatus.NOT_FOUND).send({ error: "Demo asset not found" });
		}
	});

	fastify.get("/editor/segment", async (request, reply) => {
		const { url, token } = request.query as { url?: string; token?: string };
		if (!url || !token) {
			return reply.status(HttpStatus.BAD_REQUEST).send({ error: "Missing url or token" });
		}

		if (!/^[A-Za-z0-9_=-]*$/.test(url)) {
			return reply.status(HttpStatus.BAD_REQUEST).send({ error: "Invalid url encoding" });
		}

		let decoded: string;
		try {
			decoded = Buffer.from(url, "base64url").toString("utf8");
		} catch {
			return reply.status(HttpStatus.BAD_REQUEST).send({ error: "Invalid url encoding" });
		}

		if (decoded.includes("")) {
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

		const upstream = await fetch(decoded, { headers: { "vod-token": token } });
		if (!upstream.ok) {
			return reply.status(upstream.status).send();
		}

		reply.header("Content-Type", upstream.headers.get("content-type") ?? "video/mp4");
		return reply.send(upstream.body);
	});

	fastify.post<{ Body: PreviewSourceBody }>("/editor/preview-source", async (request, reply) => {
		const { source, mpdXml: rawMpdXml, mpdBaseUrl, segmentStartTimeMs } = request.body;

		if (source.type !== "channel-range") {
			return reply
				.status(HttpStatus.BAD_REQUEST)
				.send({ error: "source.type must be channel-range" });
		}

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

		let channelPlayApi: ChannelPlayApiPort;

		if (rawMpdXml && mpdBaseUrl && segmentStartTimeMs !== undefined) {
			const mpdXml = rawMpdXml;
			const baseUrl = mpdBaseUrl;
			const segStartMs = segmentStartTimeMs;
			channelPlayApi = {
				fetchMpd: async () => ({
					mpdXml,
					baseUrl,
					segmentStartTimeMs: segStartMs,
				}),
			};
		} else if (channelId === DEMO_PREVIEW_CHANNEL_ID) {
			const demoAdapter = new DemoChannelPlayApiAdapter(config.SERVER_BASE_URL);
			channelPlayApi = demoAdapter;
		} else if (config.BASE_URL && config.CORE_EXTENSION) {
			const ztubeToken = (request.headers["x-ztube-token"] as string | undefined) ?? "";
			channelPlayApi = new HttpChannelPlayApiAdapter(
				config.BASE_URL + config.CORE_EXTENSION,
				ztubeToken,
			);
		} else {
			return reply.status(HttpStatus.NOT_IMPLEMENTED).send({
				error:
					"BASE_URL and CORE_EXTENSION are not configured. Provide mpdXml/mpdBaseUrl/segmentStartTimeMs or use channelId demo-recording for local testing.",
			});
		}

		try {
			const result = await generatePreviewUseCase.execute({
				channelId,
				startTimeMs,
				endTimeMs,
				channelPlayApi,
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
