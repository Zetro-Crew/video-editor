import type { LogSelectingContext, RouteLogConfig } from "../fastify.types.js";

export const WORKING_ROUTE_CONFIG: RouteLogConfig = {
	logHttp: true,
	message: "sample search",
	selectFields: (ctx: LogSelectingContext) => {
		const { req, payload } = ctx;

		return {
			id: (req?.params as { id: string } | undefined)?.id,
			request: {
				params: req?.params,
				query: req?.query,
				body: req?.body,
			},
			response: payload,
		};
	},
};
