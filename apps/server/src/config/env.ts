import { z } from "zod";

function boolEnv(defaultValue: boolean) {
	return z.preprocess((val) => {
		if (typeof val === "boolean") return val;
		const str = String(val ?? "").toLowerCase();
		if (["true", "1", "yes", "on"].includes(str)) return true;
		if (["false", "0", "no", "off", ""].includes(str)) return false;
		return defaultValue;
	}, z.boolean());
}

const envSchema = z.object({
	// Observability (OTel disabled when OTEL_ENDPOINT absent)
	SERVICE_NAME: z.string().default("video-editor-server"),
	SERVICE_VERSION: z.string().default("1.0.0"),
	LOG_LEVEL: z.string().default("info"),
	OTEL_ENDPOINT: z.string().optional(),
	PYROSCOPE_SERVER_ADDRESS: z.string().optional(),
	// Server
	PORT: z.coerce.number().default(4001),
	HOST: z.string().default("127.0.0.1"),
	MIN_TRANSCODE_SEGMENT_SECONDS: z.coerce.number().default(0.35),
	FFMPEG_PRESET: z.string().default("veryfast"),
	FFMPEG_CRF: z.string().default("20"),
	FFMPEG_AUDIO_BITRATE: z.string().default("192k"),
	FFMPEG_MAX_CONCURRENT: z.coerce.number().int().min(1).default(2),
	// Preview source (MPD → HLS).
	// CORE_BASE_URL includes the "/private" prefix because real Core groups auth-required
	// endpoints there — the preview adapter appends `/channels/:id/play` to it.
	// Dev: http://localhost:8002/private.
	CORE_BASE_URL: z.url(),
	MOCK_VOD_BASE_URL: z.url().optional(),
	SERVER_BASE_URL: z.string(),
	MAX_PREVIEW_DURATION_MS: z.coerce.number().default(3600000),
	PREVIEW_JOB_TTL_SECONDS: z.coerce.number().default(86400),
	S3_PREVIEW_PREFIX: z.string().default("preview"),
	// HMAC secret for segment-proxy URL signing. Prevents SSRF via /editor/segment.
	PREVIEW_SIGNING_SECRET: z.string().min(32),
	// MPD
	ENABLE_MPD_RESTRICTIONS: boolEnv(false),
	TRANSCODE_TIMEOUT_MS: z.coerce.number().default(7200000),
	MAX_TEMP_FILE_SIZE_MB: z.coerce.number().default(5000),
	MPD_TRANSCODE_CRF_MULTI: z.string().default("10"),
	MPD_TRANSCODE_CRF_SINGLE: z.string().default("18"),
	MPD_TRANSCODE_PRESET: z.string().default("medium"),
	// S3
	S3_BUCKET: z.string(),
	S3_REGION: z.string().default("us-east-1"),
	S3_ENDPOINT: z.string(),
	S3_FORCE_PATH_STYLE: boolEnv(true),
	S3_ACCESS_KEY_ID: z.string(),
	S3_SECRET_ACCESS_KEY: z.string(),
	S3_UPLOAD_PREFIX: z.string().default("uploads"),
	S3_OUTPUT_PREFIX: z.string().default("output"),
	S3_AUTO_CREATE_BUCKET: boolEnv(true),
	// Redis
	REDIS_HOST: z.string(),
	REDIS_PORT: z.coerce.number(),
	REDIS_PASSWORD: z.string().default(""),
	JOB_PROGRESS_TTL_SECONDS: z.coerce.number().default(600),
	RENDER_URL_EXPIRY_SECONDS: z.coerce.number().default(86400),
	// Messaging
	RABBITMQ_URL: z.string(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function parseEnv(): EnvConfig {
	const result = envSchema.safeParse(process.env);
	if (!result.success) {
		const errors = result.error.issues
			.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
			.join("\n");
		throw new Error(`Invalid environment configuration:\n${errors}`);
	}
	return result.data;
}
