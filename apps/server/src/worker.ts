import { initTelemetry, Logger } from "@ztube/observability";
import { parseWorkerEnv } from "./config/env.ts";
import { renderHistogramViews } from "./features/render/observability/histogram-views.ts";

const config = parseWorkerEnv();

if (config.OTEL_ENDPOINT) {
	initTelemetry({
		serviceName: `${config.SERVICE_NAME}-worker`,
		serviceVersion: config.SERVICE_VERSION,
		otelEndpoint: config.OTEL_ENDPOINT,
		logLevel: config.LOG_LEVEL,
		histogramViews: renderHistogramViews,
	});
}

const { Worker } = await import("./bootstrap/worker.ts");
const { createShutdown } = await import("./bootstrap/shutdown.ts");

const worker = new Worker({ config });
const shutdown = createShutdown({
	system: worker,
	hardExitMs: 600_000,
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

worker.start().catch((err: unknown) => {
	Logger.logError("[worker startup] failed", err instanceof Error ? err : new Error(String(err)));
	process.exit(1);
});
