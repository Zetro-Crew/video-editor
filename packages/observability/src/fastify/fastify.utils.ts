import type { LogPhase, RequestWithMeta, RouteLogConfig } from "./fastify.types.js";

export const getRouteConfig = (req: RequestWithMeta): RouteLogConfig =>
	req.routeOptions.config as unknown as RouteLogConfig;

export const getBaseFields = (req: RequestWithMeta): Record<string, unknown> => {
	const { routeOptions, method, url } = req;
	const route = routeOptions.url;

	return { method, route, url };
};

export const getDurationMs = (req: RequestWithMeta): undefined | number => {
	const start = req._logStartTime;
	if (!start) return undefined;

	return Number(process.hrtime.bigint() - start) / 1_000_000;
};

export const resolveLogMessage = (
	req: RequestWithMeta,
	routeConfig: RouteLogConfig,
	phase: LogPhase,
): string => {
	const { message } = routeConfig;
	if (message) return `${phase}: ${message}`;

	const handler = req.routeOptions.handler;
	const handlerName = handler.name;

	return `${phase}: ${handlerName}`;
};
