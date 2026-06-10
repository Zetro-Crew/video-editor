import type { FastifyInstance } from "fastify";
import { describe, expect, test } from "vitest";
import { mockGetRequest, testWithApp } from "./fastify-logs-test.utils.js";

describe("fastifyLoggingPlugin onError — statusCode regression", () => {
	test("when route throws an error carrying statusCode 400, onError logs the actual status (not 500)", async () => {
		await testWithApp(
			{ enableByDefault: true },
			(app: FastifyInstance) => {
				app.get("/boom", { config: { message: "boom" } }, async () => {
					const err = new Error("bad input") as Error & { statusCode: number };
					err.statusCode = 400;
					throw err;
				});
			},
			async (app, records) => {
				await mockGetRequest(app, "/boom");
				const errorLog = records.find((r) => r.err?.message === "bad input");
				expect(errorLog).toBeDefined();
				expect(errorLog.statusCode).toBe(400);
			},
		);
	});
});
