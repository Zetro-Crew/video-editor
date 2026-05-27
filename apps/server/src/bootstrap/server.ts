import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { fastifyLoggingPlugin } from "@ztube/observability/fastify";
import type { EnvConfig } from "../config/env.ts";
import { editVideoController } from "../features/edit-video/adapters/inbound/http/edit-video.controller.ts";
import { editorExportController } from "../features/editor-export/adapters/inbound/http/editor-export.controller.ts";
import { previewController } from "../features/preview/adapters/inbound/http/preview.controller.ts";
import { renderController } from "../features/render/adapters/inbound/http/render.controller.ts";
import { uploadController } from "../features/upload/adapters/inbound/http/upload.controller.ts";
import { createFastifyInstance, type TypedFastify } from "../infrastructure/fastify/fastify.ts";
import type { Container } from "./container.ts";

export class Server {
	private readonly app: TypedFastify;
	private readonly container: Container;
	private readonly config: EnvConfig;

	constructor(container: Container, config: EnvConfig) {
		this.app = createFastifyInstance();
		this.container = container;
		this.config = config;
	}

	async start(): Promise<void> {
		this.app.get("/health", async () => ({ status: "ok" }));

		await this.app.register(cors, { origin: true });
		await this.app.register(multipart, {
			limits: { fileSize: 500 * 1024 * 1024 },
		});
		await this.app.register(fastifyLoggingPlugin, {
			enableByDefault: true,
			logStarted: false,
			logSuccess: true,
		});

		await this.app.register(uploadController, {
			uploadUseCase: this.container.uploadUseCase,
		});

		await this.app.register(editVideoController, {
			videoRenderUseCase: this.container.videoRenderUseCase,
			editVideoJobStatePort: this.container.editVideoJobStatePort,
			s3OutputPrefix: this.config.S3_OUTPUT_PREFIX,
		});

		await this.app.register(renderController, {
			videoRenderUseCase: this.container.videoRenderUseCase,
			renderJobStatePort: this.container.renderJobStatePort,
			s3OutputPrefix: this.config.S3_OUTPUT_PREFIX,
		});

		await this.app.register(previewController, {
			storage: this.container.storage,
			config: this.config,
		});

		await this.app.register(editorExportController, {
			videoRenderUseCase: this.container.videoRenderUseCase,
			s3OutputPrefix: this.config.S3_OUTPUT_PREFIX,
		});

		if (this.config.S3_AUTO_CREATE_BUCKET) {
			try {
				await this.container.storage.ensureBucketExists();
				this.app.log.info(`S3 bucket '${this.config.S3_BUCKET}' ready`);
			} catch (err) {
				this.app.log.warn(err, "Could not ensure S3 bucket exists; uploads may fail");
			}
		}

		try {
			await this.app.listen({
				port: this.config.PORT,
				host: this.config.HOST,
			});
			this.app.log.info({ port: this.config.PORT, host: this.config.HOST }, "server listening");
		} catch (err) {
			this.app.log.error(err);
			process.exit(1);
		}
	}

	stop = async (): Promise<void> => await this.app.close();
}
