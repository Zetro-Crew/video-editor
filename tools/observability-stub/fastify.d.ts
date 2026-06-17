// Type surface for the @ztube/observability/fastify subpath stub.

import type { FastifyPluginAsync } from "fastify";

export interface HttpErrorOptions {
	statusCode: number;
	message: string;
	expose?: boolean;
	cause?: unknown;
	details?: Record<string, unknown>;
}

export declare class HttpError extends Error {
	readonly statusCode: number;
	readonly expose: boolean;
	readonly details?: Record<string, unknown>;
	constructor(options: HttpErrorOptions);
}

export interface FastifyLoggingPluginOptions {
	enableByDefault?: boolean;
	logStarted?: boolean;
	logSuccess?: boolean;
}

export declare const fastifyLoggingPlugin: FastifyPluginAsync<FastifyLoggingPluginOptions>;

// The real plugin augments Fastify's per-route context config with logging
// toggles; mirror the key apps/server uses so `config: { logHttp: false }`
// type-checks.
declare module "fastify" {
	interface FastifyContextConfig {
		logHttp?: boolean;
	}
}
