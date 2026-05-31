import { initTelemetry, Logger } from "@ztube/observability";
import { parseEnv } from "./config/env.ts";

const config = parseEnv();

if (config.OTEL_ENDPOINT) {
	initTelemetry({
		serviceName: config.SERVICE_NAME,
		serviceVersion: config.SERVICE_VERSION,
		otelEndpoint: config.OTEL_ENDPOINT,
		logLevel: config.LOG_LEVEL,
	});
}

const { System } = await import("./bootstrap/system.ts");
const { createShutdown } = await import("./bootstrap/shutdown.ts");

const system = new System(config);
const shutdown = createShutdown({ system });

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

system.start().catch((err: unknown) => {
	Logger.logError("[startup] failed", err instanceof Error ? err : new Error(String(err)));
	process.exit(1);
});
