import { createZMonitor } from "@ztube/observability";
import { createClient } from "redis";
import type { EnvConfig } from "../config/env.ts";
import { RedisEditVideoJobStateAdapter } from "../features/edit-video/adapters/outbound/redis/RedisEditVideoJobStateAdapter.ts";
import { GeneratePreviewUseCase } from "../features/preview/application/use-cases/GeneratePreviewUseCase.ts";
import { RedisRenderJobStateAdapter } from "../features/render/adapters/outbound/redis/RedisRenderJobStateAdapter.ts";
import { VideoRenderUseCase } from "../features/render/application/use-cases/VideoRenderUseCase.ts";
import { UploadUseCase } from "../features/upload/application/use-cases/UploadUseCase.ts";
import { FfmpegVideoProcessingAdapter } from "../infrastructure/ffmpeg/FfmpegVideoProcessingAdapter.ts";
import { RabbitMQPublisher } from "../infrastructure/messaging/RabbitMQPublisher.ts";
import { S3StorageAdapter } from "../infrastructure/storage/S3StorageAdapter.ts";
import type { StoragePort } from "../shared/application/ports/outbound/StoragePort.ts";

export type RedisClient = ReturnType<typeof createClient>;

export interface Container {
	storage: StoragePort;
	redis: RedisClient;
	uploadUseCase: UploadUseCase;
	videoRenderUseCase: VideoRenderUseCase;
	renderJobStatePort: RedisRenderJobStateAdapter;
	editVideoJobStatePort: RedisEditVideoJobStateAdapter;
	generatePreviewUseCase: GeneratePreviewUseCase;
	exportEventPublisher: RabbitMQPublisher;
}

export function buildContainer(config: EnvConfig): Container {
	const storage = new S3StorageAdapter({
		bucket: config.S3_BUCKET,
		region: config.S3_REGION,
		endpoint: config.S3_ENDPOINT,
		forcePathStyle: config.S3_FORCE_PATH_STYLE,
		accessKeyId: config.S3_ACCESS_KEY_ID,
		secretAccessKey: config.S3_SECRET_ACCESS_KEY,
	});

	const redis = createClient({
		socket: {
			host: config.REDIS_HOST,
			port: config.REDIS_PORT,
		},
		password: config.REDIS_PASSWORD || undefined,
	});

	const videoProcessing = new FfmpegVideoProcessingAdapter(storage, config);

	const uploadUseCase = new UploadUseCase(storage, config.S3_UPLOAD_PREFIX);
	const videoRenderUseCase = new VideoRenderUseCase(videoProcessing);
	const renderJobStatePort = new RedisRenderJobStateAdapter(redis);
	const editVideoJobStatePort = new RedisEditVideoJobStateAdapter(redis);
	const generatePreviewUseCase = new GeneratePreviewUseCase(storage, config);

	const exportEventPublisher = new RabbitMQPublisher(config.RABBITMQ_URL, createZMonitor);

	return {
		storage,
		redis,
		uploadUseCase,
		videoRenderUseCase,
		renderJobStatePort,
		editVideoJobStatePort,
		generatePreviewUseCase,
		exportEventPublisher,
	};
}
