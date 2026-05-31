import type { FastifyInstance } from "fastify";
import fastify from "fastify";
import split2 from "split2";
import { fastifyLoggingPlugin } from "../fastify.js";
import type { httpLoggingOptions, RouteLogConfig } from "../fastify.types.js";

const createTestLogger = () => {
	const records: any[] = [];

	const stream = split2(JSON.parse);

	stream.on("data", (obj: any) => {
		records.push(obj);
	});

	const loggerOptions = {
		level: "trace",
		timestamp: false,
		stream,
	};

	return { loggerOptions, records };
};

const createTestApp = (
	pluginOpts: httpLoggingOptions,
	registerRoutes: (app: FastifyInstance) => void,
): { app: FastifyInstance; records: any[] } => {
	const { loggerOptions, records } = createTestLogger();
	const app = fastify({ logger: loggerOptions, disableRequestLogging: true });
	app.register(fastifyLoggingPlugin, pluginOpts);
	registerRoutes(app);

	return { app, records };
};

export const registerSampleRoutes =
	(config: RouteLogConfig) =>
	(app: FastifyInstance): void => {
		app.post("/sample/:id", { config }, async function handler(req) {
			const body = req.body as any;

			return {
				ok: true,
				count: body?.limit ?? 0,
			};
		});
		app.get("/sample/:id", async function handler(req) {
			const { id } = req.params as any;

			return id;
		});
	};

export const mockPostRequest = (app: FastifyInstance, param: string) =>
	app.inject({
		method: "POST",
		url: `sample/${param}?from=prince&to=king`,
		payload: { limit: 10, trackIds: ["t1", "t2"] },
	});

export const mockGetRequest = (app: FastifyInstance, url: string) =>
	app.inject({ method: "GET", url });

export const testWithApp = async (
	pluginOpts: httpLoggingOptions,
	routeSetup: (app: FastifyInstance) => void,
	testBody: (app: FastifyInstance, records: any[]) => Promise<void>,
): Promise<void> => {
	const { app, records } = createTestApp(pluginOpts, routeSetup);
	await app.ready();

	try {
		await testBody(app, records);
	} finally {
		await app.close();
	}
};
