import { Logger } from "@ztube/observability";
import type { EnvConfig } from "../config/env.ts";
import { buildContainer, type Container } from "./container.ts";
import { Server } from "./server.ts";

export class System {
	private readonly container: Container;
	private readonly server: Server;
	private readonly config: EnvConfig;

	constructor(config: EnvConfig, container?: Container, server?: Server) {
		this.config = config;
		this.container = container ?? buildContainer(config);
		this.server = server ?? new Server(this.container, config);
	}

	async start(): Promise<void> {
		this.container.redis.on("error", (err) =>
			Logger.logError("[redis]", err instanceof Error ? err : new Error(String(err))),
		);
		Logger.logInfo("[startup] connecting to Redis", {
			host: this.config.REDIS_HOST,
			port: this.config.REDIS_PORT,
		});
		await this.container.redis.connect();
		Logger.logInfo("[startup] Redis connected");
		let publisherConnected = false;
		try {
			Logger.logInfo("[startup] connecting to RabbitMQ");
			await this.container.exportEventPublisher.connect();
			publisherConnected = true;
			Logger.logInfo("[startup] RabbitMQ connected");
			await this.server.start();
		} catch (err) {
			if (publisherConnected) {
				try {
					await this.container.exportEventPublisher.close();
				} catch (closeErr) {
					Logger.logError(
						"[startup] publisher close failed during cleanup",
						closeErr instanceof Error ? closeErr : new Error(String(closeErr)),
					);
				}
			}
			try {
				await this.container.redis.quit();
			} catch (quitErr) {
				Logger.logError(
					"[startup] redis quit failed during cleanup",
					quitErr instanceof Error ? quitErr : new Error(String(quitErr)),
				);
			}
			throw err;
		}
	}

	async stop(): Promise<void> {
		try {
			await this.server.stop();
		} catch (err) {
			Logger.logError(
				"[shutdown] server stop failed",
				err instanceof Error ? err : new Error(String(err)),
			);
		}
		try {
			Logger.logInfo("[shutdown] draining outstanding publishes");
			await this.container.exportEventPublisher.drain(5_000);
		} catch (err) {
			Logger.logError(
				"[shutdown] publisher drain failed",
				err instanceof Error ? err : new Error(String(err)),
			);
		}
		try {
			Logger.logInfo("[shutdown] closing RabbitMQ publisher");
			await this.container.exportEventPublisher.close();
		} catch (err) {
			Logger.logError(
				"[shutdown] publisher close failed",
				err instanceof Error ? err : new Error(String(err)),
			);
		}
		try {
			await this.container.redis.quit();
		} catch (err) {
			Logger.logError(
				"[shutdown] redis quit failed",
				err instanceof Error ? err : new Error(String(err)),
			);
		}
	}
}
