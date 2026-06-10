import type { FastifyInstance } from "fastify";
import { describe, expect, test } from "vitest";
import { HttpError } from "../fastify.errors.js";
import { mockGetRequest, testWithApp } from "./fastify-logs-test.utils.js";

describe("fastifyLoggingPlugin onError — HttpError integration", () => {
	test("route throws HttpError(400): log statusCode=400, err.expose=true", async () => {
		await testWithApp(
			{ enableByDefault: true },
			(app: FastifyInstance) => {
				app.setErrorHandler((err, _req, reply) => {
					if (err instanceof HttpError) {
						return reply.status(err.statusCode).send({ error: err.message });
					}
					return reply.status(500).send({ error: "Internal error" });
				});
				app.get("/bad", { config: { message: "bad" } }, async () => {
					throw new HttpError({ statusCode: 400, message: "missing field" });
				});
			},
			async (app, records) => {
				const res = await mockGetRequest(app, "/bad");
				expect(res.statusCode).toBe(400);
				expect(res.json()).toEqual({ error: "missing field" });

				const errorLog = records.find((r) => r.err);
				expect(errorLog).toBeDefined();
				expect(errorLog.statusCode).toBe(400);
				expect(errorLog.err.expose).toBe(true);
			},
		);
	});

	test("route throws HttpError(503) with cause + details: log captures statusCode, details, and cause", async () => {
		class PublishExhaustedError extends Error {
			constructor() {
				super("broker down");
				this.name = "PublishExhaustedError";
			}
		}

		await testWithApp(
			{ enableByDefault: true },
			(app: FastifyInstance) => {
				app.setErrorHandler((err, _req, reply) => {
					if (err instanceof HttpError) {
						return reply.status(err.statusCode).send({
							error: err.expose ? err.message : "Internal error",
						});
					}
					return reply.status(500).send({ error: "Internal error" });
				});
				app.get("/queue", { config: { message: "queue" } }, async () => {
					throw new HttpError({
						statusCode: 503,
						message: "render queue unavailable",
						cause: new PublishExhaustedError(),
						details: { attempts: 3 },
					});
				});
			},
			async (app, records) => {
				const res = await mockGetRequest(app, "/queue");
				expect(res.statusCode).toBe(503);
				// expose=false by default for 5xx → body stays generic, real message log-only
				expect(res.json()).toEqual({ error: "Internal error" });

				const errorLog = records.find((r) => r.err);
				expect(errorLog).toBeDefined();
				expect(errorLog.statusCode).toBe(503);
				expect(errorLog.err.details).toEqual({ attempts: 3 });
				expect(errorLog.err.stack).toContain("PublishExhaustedError");
			},
		);
	});

	test("FastifyError (schema validation) is logged with statusCode=400 via duck-typing", async () => {
		await testWithApp(
			{ enableByDefault: true },
			(app: FastifyInstance) => {
				app.post(
					"/validated",
					{
						config: { message: "validated" },
						schema: {
							body: {
								type: "object",
								required: ["name"],
								properties: { name: { type: "string" } },
							},
						},
					},
					async () => ({ ok: true }),
				);
			},
			async (app, records) => {
				const res = await app.inject({
					method: "POST",
					url: "/validated",
					payload: {},
				});
				expect(res.statusCode).toBe(400);

				const errorLog = records.find((r) => r.err);
				expect(errorLog).toBeDefined();
				expect(errorLog.statusCode).toBe(400);
			},
		);
	});
});
