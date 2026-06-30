import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { fastifyLoggingPlugin } from "@ztube/observability/fastify";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import type { ApiEnvConfig } from "../config/env.ts";
import { previewController } from "../features/preview/adapters/inbound/http/preview.controller.ts";
import { projectController } from "../features/project/adapters/inbound/http/project.controller.ts";
import { renderController } from "../features/render/adapters/inbound/http/render.controller.ts";
import { uploadController } from "../features/upload/adapters/inbound/http/upload.controller.ts";
import { createFastifyInstance, type TypedFastify } from "../infrastructure/fastify/fastify.ts";
import type { ApiContainer } from "./container.ts";

export class Server {
	private readonly app: TypedFastify;
	private readonly container: ApiContainer;
	private readonly config: ApiEnvConfig;

	constructor(container: ApiContainer, config: ApiEnvConfig) {
		this.app = createFastifyInstance();
		this.container = container;
		this.config = config;
	}

	async start(): Promise<void> {
		this.app.get("/health", { config: { logHttp: false }, schema: { hide: true } }, async () => ({
			status: "ok",
		}));

		await this.app.register(cors, { origin: true });
		await this.app.register(fastifyLoggingPlugin, {
			enableByDefault: true,
			logStarted: false,
			logSuccess: true,
		});

		await this.app.register(swagger, {
			openapi: {
				openapi: "3.0.3",
				info: {
					title: "Video Editor Server",
					version: this.config.SERVICE_VERSION,
				},
				servers: [
					{
						url: `${this.config.SERVER_BASE_URL}${this.config.SERVER_PUBLIC_PATH_PREFIX}`,
					},
				],
			},
			transform: jsonSchemaTransform,
		});
		await this.app.register(swaggerUI, { routePrefix: "/docs" });

		this.app.get(
			"/openapi.json",
			{ config: { logHttp: false }, schema: { hide: true } },
			async () => this.app.swagger(),
		);

		await this.app.register(uploadController, {
			uploadUseCase: this.container.uploadUseCase,
		});

		await this.app.register(renderController, {
			renderCommandPort: this.container.renderCommandPort,
		});

		await this.app.register(previewController, {
			storage: this.container.storage,
			config: this.config,
		});

		await this.app.register(projectController, {
			saveProjectUseCase: this.container.saveProjectUseCase,
			getProjectUseCase: this.container.getProjectUseCase,
			listProjectsUseCase: this.container.listProjectsUseCase,
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
			throw err;
		}
	}

	stop = async (): Promise<void> => await this.app.close();
}
