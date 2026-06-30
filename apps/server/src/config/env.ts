import { z } from "zod";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Required for amqps with self-signed certs. Should be safe since we control the certs and only use amqps for RabbitMQ connections.

function boolEnv(defaultValue: boolean) {
	return z.preprocess((val) => {
		if (typeof val === "boolean") return val;
		const str = String(val ?? "").toLowerCase();
		if (["true", "1", "yes", "on"].includes(str)) return true;
		if (["false", "0", "no", "off", ""].includes(str)) return false;
		return defaultValue;
	}, z.boolean());
}

// Fields used by both the API and the Worker processes.
const commonEnvSchema = z.object({
	// Observability (OTel disabled when OTEL_ENDPOINT absent)
	SERVICE_NAME: z.string().default("video-editor-server"),
	SERVICE_VERSION: z.string().default("1.0.0"),
	LOG_LEVEL: z.string().default("info"),
	OTEL_ENDPOINT: z.string().optional(),
	// FFmpeg
	MIN_TRANSCODE_SEGMENT_SECONDS: z.coerce.number().default(0.35),
	FFMPEG_PRESET: z.string().default("veryfast"),
	FFMPEG_CRF: z.string().default("20"),
	FFMPEG_AUDIO_BITRATE: z.string().default("192k"),
	FFMPEG_MAX_CONCURRENT: z.coerce.number().int().min(1).default(2),
	// MPD / source-processor transcoding — used by both API (preview) and Worker (render)
	ENABLE_MPD_RESTRICTIONS: boolEnv(false),
	TRANSCODE_TIMEOUT_MS: z.coerce.number().default(7200000),
	MAX_TEMP_FILE_SIZE_MB: z.coerce.number().default(5000),
	MPD_TRANSCODE_CRF_MULTI: z.string().default("10"),
	MPD_TRANSCODE_CRF_SINGLE: z.string().default("18"),
	MPD_TRANSCODE_PRESET: z.string().default("medium"),
	// S3 (connection + shared prefix)
	S3_BUCKET: z.string(),
	S3_REGION: z.string().default("us-east-1"),
	S3_ENDPOINT: z.string(),
	S3_FORCE_PATH_STYLE: boolEnv(true),
	S3_ACCESS_KEY_ID: z.string(),
	S3_SECRET_ACCESS_KEY: z.string(),
	S3_OUTPUT_PREFIX: z.string().default("output"),
	RENDER_URL_EXPIRY_SECONDS: z.coerce.number().default(86400),
	// Messaging — both processes connect, assert topology, and use the publisher factory.
	// `amqps://` triggers mTLS: process reads /bundle.pem (CA),
	// /tmp/certificates/rabbitmq/rabbit_cert.pem, and /tmp/certificates/rabbitmq/rabbit_key.pem at boot.
	QUEUE_URL: z.string(),
	COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
	EVENT_PUBLISH_CONFIRM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
	AMQP_INITIAL_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
	RENDER_REQUEST_TTL_MS: z.coerce.number().int().positive().optional(),
});

const apiEnvSchema = commonEnvSchema.extend({
	// Server bind
	PORT: z.coerce.number().default(4001),
	HOST: z.string().default("127.0.0.1"),
	// Preview source (MPD → HLS).
	// CORE_BASE_URL includes the "/private" prefix because real Core groups auth-required
	// endpoints there — the preview adapter appends `/channels/:id/play` to it.
	// Dev: http://localhost:8002/private.
	CORE_BASE_URL: z.url(),
	MOCK_VOD_BASE_URL: z.url().optional(),
	SERVER_BASE_URL: z.string(),
	// Optional ingress path prefix (e.g. "/api/video_editor/server") prepended to
	// public-facing URLs the server emits (segment-proxy URLs in HLS playlists).
	// Empty in local dev; set in environments fronted by a path-stripping reverse proxy.
	SERVER_PUBLIC_PATH_PREFIX: z.string().default(""),
	MAX_PREVIEW_DURATION_MS: z.coerce.number().default(3600000),
	PREVIEW_JOB_TTL_SECONDS: z.coerce.number().default(86400),
	S3_PREVIEW_PREFIX: z.string().default("preview"),
	// HMAC secret for segment-proxy URL signing. Prevents SSRF via /editor/segment.
	PREVIEW_SIGNING_SECRET: z.string().min(32),
	// Upload — API issues presigned PUTs and enforces the cap via signed Content-Length
	S3_UPLOAD_PREFIX: z.string().default("uploads"),
	UPLOAD_MAX_SIZE_BYTES: z.coerce.number().int().positive().default(524_288_000),
	// Bootstrap-only
	S3_AUTO_CREATE_BUCKET: boolEnv(true),
	// MongoDB
	MONGO_URL: z.string(),
	MONGO_DB_NAME: z.string().default("video-editor"),
});

const workerEnvSchema = commonEnvSchema.extend({
	WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(1),
	WORKER_PROBE_PORT: z.coerce.number().int().positive().default(8081),
});

export type CommonEnvConfig = z.infer<typeof commonEnvSchema>;
export type ApiEnvConfig = z.infer<typeof apiEnvSchema>;
export type WorkerEnvConfig = z.infer<typeof workerEnvSchema>;

function formatIssues(error: z.ZodError): string {
	return error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n");
}

export function parseApiEnv(): ApiEnvConfig {
	const result = apiEnvSchema.safeParse(process.env);
	if (!result.success) {
		throw new Error(`Invalid environment configuration (API):\n${formatIssues(result.error)}`);
	}
	return result.data;
}

export function parseWorkerEnv(): WorkerEnvConfig {
	const result = workerEnvSchema.safeParse(process.env);
	if (!result.success) {
		throw new Error(`Invalid environment configuration (Worker):\n${formatIssues(result.error)}`);
	}
	return result.data;
}
