import { createZMonitor } from "@ztube/observability";
import type { EnvConfig } from "../config/env.ts";
import { GeneratePreviewUseCase } from "../features/preview/application/use-cases/GeneratePreviewUseCase.ts";
import { RenderDLQConsumer } from "../features/render/adapters/inbound/amqp/RenderDLQConsumer.ts";
import { RenderRequestedConsumer } from "../features/render/adapters/inbound/amqp/RenderRequestedConsumer.ts";
import { RabbitMQRenderCommandAdapter } from "../features/render/adapters/outbound/amqp/RabbitMQRenderCommandAdapter.ts";
import type { RenderCommandPort } from "../features/render/application/ports/outbound/RenderCommandPort.ts";
import { VideoRenderUseCase } from "../features/render/application/use-cases/VideoRenderUseCase.ts";
import { UploadUseCase } from "../features/upload/application/use-cases/UploadUseCase.ts";
import { FfmpegVideoProcessingAdapter } from "../infrastructure/ffmpeg/FfmpegVideoProcessingAdapter.ts";
import { RabbitMQPublisher } from "../infrastructure/messaging/RabbitMQPublisher.ts";
import { S3StorageAdapter } from "../infrastructure/storage/S3StorageAdapter.ts";
import type { StoragePort } from "../shared/application/ports/outbound/StoragePort.ts";

function buildStorage(config: EnvConfig): StoragePort {
	return new S3StorageAdapter({
		bucket: config.S3_BUCKET,
		region: config.S3_REGION,
		endpoint: config.S3_ENDPOINT,
		forcePathStyle: config.S3_FORCE_PATH_STYLE,
		accessKeyId: config.S3_ACCESS_KEY_ID,
		secretAccessKey: config.S3_SECRET_ACCESS_KEY,
	});
}

function buildPublisher(config: EnvConfig): RabbitMQPublisher {
	return new RabbitMQPublisher(config.RABBITMQ_URL, createZMonitor, {
		commandConfirmTimeoutMs: config.COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS,
		eventConfirmTimeoutMs: config.EVENT_PUBLISH_CONFIRM_TIMEOUT_MS,
		initialConnectTimeoutMs: config.AMQP_INITIAL_CONNECT_TIMEOUT_MS,
		renderRequestTtlMs: config.RENDER_REQUEST_TTL_MS,
	});
}

export interface ApiContainer {
	storage: StoragePort;
	uploadUseCase: UploadUseCase;
	generatePreviewUseCase: GeneratePreviewUseCase;
	exportEventPublisher: RabbitMQPublisher;
	renderCommandPort: RenderCommandPort;
}

export function buildApiContainer(config: EnvConfig): ApiContainer {
	const storage = buildStorage(config);
	const exportEventPublisher = buildPublisher(config);

	const uploadUseCase = new UploadUseCase(
		storage,
		config.S3_UPLOAD_PREFIX,
		config.UPLOAD_MAX_SIZE_BYTES,
	);
	const generatePreviewUseCase = new GeneratePreviewUseCase(storage, config);
	const renderCommandPort = new RabbitMQRenderCommandAdapter(exportEventPublisher);

	return {
		storage,
		uploadUseCase,
		generatePreviewUseCase,
		exportEventPublisher,
		renderCommandPort,
	};
}

export interface WorkerContainer {
	storage: StoragePort;
	exportEventPublisher: RabbitMQPublisher;
	videoRenderUseCase: VideoRenderUseCase;
	renderRequestedConsumer: RenderRequestedConsumer;
	renderDLQConsumer: RenderDLQConsumer;
}

export function buildWorkerContainer(config: EnvConfig): WorkerContainer {
	const storage = buildStorage(config);
	const exportEventPublisher = buildPublisher(config);
	const videoProcessing = new FfmpegVideoProcessingAdapter(storage, config);
	const videoRenderUseCase = new VideoRenderUseCase(videoProcessing);

	const renderRequestedConsumer = new RenderRequestedConsumer({
		storage,
		videoRenderUseCase,
		exportPublisher: exportEventPublisher,
		monitorFactory: createZMonitor,
		s3OutputPrefix: config.S3_OUTPUT_PREFIX,
		renderUrlExpirySeconds: config.RENDER_URL_EXPIRY_SECONDS,
	});

	const renderDLQConsumer = new RenderDLQConsumer({
		exportPublisher: exportEventPublisher,
		monitorFactory: createZMonitor,
	});

	return {
		storage,
		exportEventPublisher,
		videoRenderUseCase,
		renderRequestedConsumer,
		renderDLQConsumer,
	};
}
