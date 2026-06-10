import { Logger } from "@ztube/observability";
import { HttpError } from "@ztube/observability/fastify";
import Fastify, {
	type FastifyInstance,
	type FastifyRequest,
	type RawReplyDefaultExpression,
	type RawRequestDefaultExpression,
	type RawServerDefault,
	type RouteGenericInterface,
} from "fastify";
import {
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { HttpStatus } from "../../shared/utils/http-status.ts";

export type Request<
	Body = unknown,
	Querystring = unknown,
	Params = unknown,
	Headers = unknown,
> = FastifyRequest<
	RouteGenericInterface & {
		Body: Body;
		Querystring: Querystring;
		Params: Params;
		Headers: Headers;
	}
>;

type PinoLogger = ReturnType<typeof Logger.getInstance>;

export type TypedFastify = FastifyInstance<
	RawServerDefault,
	RawRequestDefaultExpression,
	RawReplyDefaultExpression,
	PinoLogger,
	ZodTypeProvider
>;

export const createFastifyInstance = (): TypedFastify => {
	const app = Fastify({
		loggerInstance: Logger.getInstance().child({ module: "Fastify" }),
		disableRequestLogging: true, // we handle logging ourselves in the plugin
	}).withTypeProvider<ZodTypeProvider>();
	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

	app.setErrorHandler((error: Error & { validation?: unknown }, _request, reply) => {
		if (error instanceof HttpError) {
			return reply.status(error.statusCode).send({
				error: error.expose ? error.message : "Internal error",
			});
		}

		if ("validation" in error && error.validation) {
			return reply.status(HttpStatus.BAD_REQUEST).send({ error: error.message });
		}

		return reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: "Internal error" });
	});

	// pino child logger is structurally compatible at runtime but fails Fastify's contravariant route overloads
	return app;
};
