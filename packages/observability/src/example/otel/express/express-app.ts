import express, { type Request, type Response } from "express";
import { Logger } from "../../../logger.js";
import { addCustomSpan, pyroscopeMiddleware } from "../../../open-telemetry/core.js";
import { metricsService } from "../../../open-telemetry/metrics.js";

const app = express();
app.disable("x-powered-by");

// Register Pyroscope Middleware
app.use((req: unknown, res: unknown, next: () => void) => {
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

app.post("/test", async (req: Request, res: Response) => {
	const startTime = Date.now();
	Logger.logInfo("Received test request", { path: req.url });

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
		res.status(200).json({ success: true, id: "34534" });
	} catch (error: unknown) {
		Logger.logError("Request processing failed", error as Error);
		metricsService.increment("request_processing_errors");
		res.status(500).json({ error: "Internal Server Error" });
	}
});

app.listen(8081, () => {
	Logger.logInfo("Express Simulation ready at http://localhost:8081/test");
});
