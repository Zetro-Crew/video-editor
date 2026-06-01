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
			await this.logFixtureWindowIfLocal();
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

	private async logFixtureWindowIfLocal(): Promise<void> {
		try {
			const coreHost = new URL(this.config.CORE_BASE_URL).hostname;
			if (coreHost !== "localhost" && coreHost !== "127.0.0.1") return;
			const mockVodUrl = this.config.MOCK_VOD_BASE_URL ?? "http://localhost:5050";
			const res = await fetch(`${mockVodUrl}/__internal/fixture-window`, {
				signal: AbortSignal.timeout(2_000),
			});
			if (!res.ok) return;
			const window = (await res.json()) as { startMs: number; endMs: number; recordingId: string };
			Logger.logInfo("[startup] mock-vod fixture window", window);
		} catch (err) {
			Logger.logInfo("[startup] mock-vod fixture window probe skipped", {
				reason: err instanceof Error ? err.message : String(err),
			});
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
