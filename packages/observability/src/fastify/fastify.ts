import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fb from "fastify-plugin";
import { isSampled, pyroscopeMiddleware } from "../index.js";
import type { httpLoggingOptions, RequestWithMeta } from "./fastify.types.js";
import { LOG_PHASE } from "./fastify.types.js";
import {
	getBaseFields,
	getDurationMs,
	getRouteConfig,
	resolveLogMessage,
} from "./fastify.utils.js";

export const fastifyLoggingPlugin = fb<httpLoggingOptions>((app: FastifyInstance, opts) => {
	const enableByDefault = opts.enableByDefault ?? false;
	const globalLogStarted = opts.logStarted ?? false;
	const globalLogSuccess = opts.logSuccess ?? true;

	const enableProfiling = opts.enableProfiling ?? false;

	if (enableProfiling) {
		// fastify types mismatch with express-like middleware signature but it works
		app.addHook("onRequest", pyroscopeMiddleware);
	}

	app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
		const reqWithMeta = req as RequestWithMeta;

		// capture start time in nanoseconds
		reqWithMeta._logStartTime = process.hrtime.bigint();
		reqWithMeta._logSampled = isSampled();

		//Resolve per-route config
		const routeConfig = getRouteConfig(reqWithMeta);
		const logEnabled = routeConfig.logHttp ?? enableByDefault;
		const logStartedEnabled = routeConfig.logStarted ?? globalLogStarted;

		if (!logEnabled || !logStartedEnabled || !reqWithMeta._logSampled) return;

		const base = getBaseFields(reqWithMeta);
		const selector = routeConfig.selectFields;
		const extra = selector
			? selector({
					phase: LOG_PHASE.STARTED,
					reply,
					req,
				})
			: {};

		const msg = resolveLogMessage(reqWithMeta, routeConfig, LOG_PHASE.STARTED);

		reqWithMeta.log.info(
			{
				...base,
				durationMs: 0,
				...extra,
			},
			msg,
		);
	});

	app.addHook("onSend", async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
		const reqWithMeta = req as RequestWithMeta;

		const routeConfig = getRouteConfig(reqWithMeta);
		const logEnabled = routeConfig.logHttp ?? enableByDefault;
		const logSuccessEnabled = routeConfig.logSuccess ?? globalLogSuccess;

		if (!logEnabled || !logSuccessEnabled || reqWithMeta.hasLoggedError || !reqWithMeta._logSampled)
			return payload;

		const base = getBaseFields(reqWithMeta);
		const durationMs = getDurationMs(reqWithMeta);

		const selector = routeConfig.selectFields;
		const extra = selector
			? selector({
					phase: LOG_PHASE.SUCCESS,
					durationMs,
					payload,
					reply,
					req,
				})
			: {};

		const msg = resolveLogMessage(reqWithMeta, routeConfig, LOG_PHASE.SUCCESS);

		reqWithMeta.log.info(
			{
				...base,
				statusCode: reply.statusCode,
				durationMs,
				...extra,
			},
			msg,
		);

		return payload;
	});

	app.addHook("onError", async (req: FastifyRequest, reply: FastifyReply, error: Error) => {
		const reqWithMeta = req as RequestWithMeta;

		const routeConfig = getRouteConfig(reqWithMeta);
		const base = getBaseFields(reqWithMeta);
		const durationMs = getDurationMs(reqWithMeta);

		const selector = routeConfig.selectFields;
		const extra = selector
			? selector({
					phase: LOG_PHASE.ERROR,
					durationMs,
					error,
					reply,
					req,
				})
			: {};

		const msg = resolveLogMessage(reqWithMeta, routeConfig, LOG_PHASE.ERROR);

		// onError fires before setErrorHandler in Fastify's lifecycle, so reply.statusCode is
		// still the pre-handler default (200). The thrown error is the authoritative source.
		// Duck-typing covers HttpError, native FastifyError (validation), and any future shape.
		const errorWithStatus = error as Error & { statusCode?: unknown };
		const derivedStatus =
			typeof errorWithStatus.statusCode === "number" ? errorWithStatus.statusCode : 500;

		reqWithMeta.log.error(
			{
				...base,
				statusCode: derivedStatus,
				durationMs,
				err: error,
				...extra,
			},
			msg,
		);

		reqWithMeta.hasLoggedError = true;
	});
});
