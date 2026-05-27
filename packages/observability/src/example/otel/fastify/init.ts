import { initTelemetry } from "../../../open-telemetry/core.js";

initTelemetry({
	serviceName: "otel-fastify-example",
	serviceVersion: "1.0.0",
	otelEndpoint: "http://localhost:4317",
	pyroscopeServerAddress: "http://localhost:4040",
});

import("./fastify-app.js").catch((err: unknown) => {
	console.error("Critical: Failed to load application entry point", err);
	// eslint-disable-next-line n/no-process-exit
	process.exit(1);
});
