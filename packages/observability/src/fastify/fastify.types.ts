import type { FastifyReply, FastifyRequest } from "fastify";

type Values<T> = T[keyof T];

export const LOG_PHASE = {
	STARTED: "STARTED",
	SUCCESS: "SUCCESS",
	ERROR: "ERROR",
} as const;
/**
 * Internal per-route logging configuration.
 * These fields can be set on `routeOptions.config` to override global behavior
 */
export type RouteLogConfig = {
	/**
	 * Optional per-route selector function that decides which fields
	 * are interesting to log (e.g. params, query, subset of body, etc)
	 *
	 * If not provided, only base fields will be logged:
	 * - method, url, message, route, statusCode, durationMs
	 *
	 * ⚠ Beware:
	 *  This function is a good place to *avoid*
	 *  Prefer explicitly selecting only the fields you need
	 */
	selectFields?: (ctx: LogSelectingContext) => Record<string, unknown>;
	/**
	 * whether to log "started" for this specific route.
	 *
	 * - If set, overrides `logStarted`.
	 * - If no set, `logStarted` is used.
	 */
	logStarted?: boolean;
	/**
	 * whether to log "success" for this specific route.
	 *
	 * - If set, overrides `logSuccess`.
	 * - If no set, `logSuccess` is used.
	 */
	logSuccess?: boolean;
	/**
	 * whether HTTP logging is enable for this specific route.
	 *
	 * - If set, overrides `enabledByDefault`.
	 * - If no set, `enabledByDefault` is used.
	 */
	logHttp?: boolean;
	/**
	 * Custom message to use as the log message
	 */
	message: string;
};

/**
 * Global http logging options for the plugin.
 *
 * These options control the *default behavior* for all routes.
 *
 * Each route can still override these defaults via `routeOptions.config`.
 */
export type httpLoggingOptions = {
	/**
	 * Log HTTP by default for all routes.
	 * Route can override via config.logHttp.
	 *
	 * Default: false
	 */
	enableByDefault?: boolean;
	/**
	 * Log "started" on Request start.
	 * Route can override via config.logStarted.
	 *
	 * Default: false
	 */
	logStarted?: boolean;
	/**
	 * Log "success" on Response.
	 * Route can override via config.logSuccess.
	 *
	 * Default: true
	 */
	logSuccess?: boolean;
	/**
	 * Enable pyroscope profiling middleware.
	 *
	 * Default: false
	 */
	enableProfiling?: boolean;
};
export type LogSelectingContext = {
	reply?: FastifyReply;
	// data
	req?: FastifyRequest;

	durationMs?: number;
	payload?: unknown;
	// metadata
	phase?: LogPhase;
	error?: Error;
};

export type RequestWithMeta = {
	hasLoggedError?: boolean;
	_logStartTime?: bigint;
	_logSampled?: boolean;
} & FastifyRequest;

export type LogPhase = Values<typeof LOG_PHASE>;
