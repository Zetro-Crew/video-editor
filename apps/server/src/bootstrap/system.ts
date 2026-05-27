import { Logger } from "@ztube/observability";
import type { EnvConfig } from "../config/env.ts";
import { buildContainer, type Container } from "./container.ts";
import { Server } from "./server.ts";

export class System {
	private readonly container: Container;
	private readonly server: Server;
	private readonly config: EnvConfig;

	constructor(config: EnvConfig) {
		this.config = config;
		this.container = buildContainer(config);
		this.server = new Server(this.container, config);
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
		await this.server.start();
	}

	async stop(): Promise<void> {
		await this.server.stop();
		await this.container.redis.quit();
	}
}
