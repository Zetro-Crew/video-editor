import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { Logger, pyroscopeMiddleware } from "../../../index.js";
import { addCustomSpan } from "../../../open-telemetry/core.js";
import { metricsService } from "../../../open-telemetry/metrics.js";

const app = Fastify({
	disableRequestLogging: true,
	loggerInstance: Logger.getInstance(),
});

// Register Pyroscope Middleware
app.addHook("onRequest", (req, res, next) => {
	pyroscopeMiddleware(req, res, next);
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const getUserFromDB = async (id: string): Promise<{ plan: string; id: string }> =>
	addCustomSpan("mongo-find-user", async (span) => {
		span.setAttribute("db.system", "mongodb");
		span.setAttribute("db.statement", `db.users.find({ id: ${id} })`);

		Logger.logInfo("Querying database for user", { userId: id });
		/* eslint-disable-next-line sonarjs/pseudo-random */
		await sleep(Math.random() * 1000);

		return { plan: "premium", id };
	});

const updateSegmentNumber = async (segmentNumber: number): Promise<{ status: string }> =>
	addCustomSpan("vod-service-call", async (span) => {
		span.setAttribute("segment.number", segmentNumber);

		Logger.logInfo("Updating VOD segment", { segmentNumber });
		/* eslint-disable-next-line sonarjs/pseudo-random */
		await sleep(Math.random() * 3000);

		return { status: "success" };
	});

const updateRedis = async (): Promise<void> =>
	addCustomSpan("update-redis", async (span) => {
		span.setAttribute("db.system", "redis");
		/* eslint-disable-next-line sonarjs/pseudo-random */
		await sleep(Math.random() * 1000);

		const err = new Error("Redis connection dropped (simulation)");
		Logger.logError("Failed to update redis cache", err, { attempt: 1 });

		throw err;
	});

app.post("/test", async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
	const startTime = Date.now();
	Logger.logInfo("Received test request", { path: request.url });

	metricsService.increment("test_requests_total", { method: "POST" });

	try {
		await getUserFromDB("dan paker");

		await addCustomSpan("process-vod-logic", async () => {
			await Promise.all([
				updateSegmentNumber(543535),
				updateRedis().catch(() => {
					Logger.logWarning("Redis update failed but continuing...");
					metricsService.increment("redis_update_failures");
				}),
			]);
		});

		const duration = Date.now() - startTime;
		metricsService.recordHistogram("request_processing_duration", duration, { success: "true" });

		Logger.logInfo("Test sequence completed successfully");
		return await reply.status(200).send({ success: true, id: "34534" });
	} catch (error: unknown) {
		Logger.logError("Request processing failed", error as Error);
		metricsService.increment("request_processing_errors");
		return await reply.status(500).send({ error: "Internal Server Error" });
	}
});

const heavyCalculation = (n: number): number => {
	if (n <= 1) return n;
	return heavyCalculation(n - 1) + heavyCalculation(n - 2);
};

const processUserRequest = (): number => heavyCalculation(41);

app.get("/cpu-stress", async (_req, _reply) => {
	const start = Date.now();
	const result = processUserRequest();
	const duration = Date.now() - start;

	return { result, duration };
});

app.listen({ port: 8080 }, () => {
	Logger.logInfo("Fastify Simulation ready at http://localhost:8080/test");
});
