import { trace } from "@opentelemetry/api";
import type { FastifyInstance } from "fastify";
import { describe, expect, test, vi } from "vitest";
import type { RequestWithMeta } from "../fastify.types.js";
import { LOG_PHASE } from "../fastify.types.js";
import { resolveLogMessage } from "../fastify.utils.js";
import { WORKING_ROUTE_CONFIG } from "./fastify-logs.mock.js";
import {
	mockGetRequest,
	mockPostRequest,
	registerSampleRoutes,
	testWithApp,
} from "./fastify-logs-test.utils.js";

describe.concurrent("fastifyLoggingPlugin - per-route logging with request + response", () => {
	test("logs started + success with selected fields, including response", async () => {
		const param = "daniel";
		const pluginOptions = {
			enableByDefault: false,
			logStarted: true,
			logSuccess: true,
		} as const;

		await testWithApp(
			pluginOptions,
			registerSampleRoutes(WORKING_ROUTE_CONFIG),
			async (app: FastifyInstance, records: any[]) => {
				await mockPostRequest(app, param);

				expect(records.length).toBe(2);
				const [started, success] = records;

				expect(started.msg).toBe(
					resolveLogMessage({} as RequestWithMeta, WORKING_ROUTE_CONFIG, LOG_PHASE.STARTED),
				);
				expect(started.id).toBe(param);

				expect(success.msg).toBe(
					resolveLogMessage({} as RequestWithMeta, WORKING_ROUTE_CONFIG, LOG_PHASE.SUCCESS),
				);

				expect(success.statusCode).toBe(200);
				expect(typeof success.durationMs).toBe("number");

				expect(JSON.parse(success.response)).toEqual({ ok: true, count: 10 });
			},
		);
	});

	test("Route config should override global config (Global ON, Local OFF)", async () => {
		const param = "daniel";
		const pluginOptions = { enableByDefault: true };

		await testWithApp(
			pluginOptions,
			registerSampleRoutes({ logHttp: false, message: "test override" }),
			async (app: FastifyInstance, records: any[]) => {
				await mockPostRequest(app, param);
				expect(records.length).toBe(0);

				// default log
				await mockGetRequest(app, `/sample/${param}`);
				expect(records.length).toBe(1);
			},
		);
	});

	test("should log error details when route throws", async () => {
		const errorMassage = "daniel rispler > amit mizrahi";
		const pluginOptions = { enableByDefault: true };

		await testWithApp(
			pluginOptions,
			(app: FastifyInstance) => {
				app.get("/boom", { config: { message: "daniel error test" } }, async () => {
					throw new Error(errorMassage);
				});
			},
			async (app: FastifyInstance, records: any[]) => {
				await mockGetRequest(app, `/boom`);
				const errorLog = records.find(({ err }) => err.message === errorMassage);

				expect(errorLog).toBeDefined();
				expect(errorLog.statusCode).toBe(500);
			},
		);
	});
});

describe("fastifyLoggingPlugin - OTel-correlated sampling", () => {
	test("suppresses success log when span is not recording (sampled out by OTel)", async () => {
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({ isRecording: () => false } as any);

		const pluginOptions = { enableByDefault: true, logSuccess: true };
		await testWithApp(
			pluginOptions,
			registerSampleRoutes(WORKING_ROUTE_CONFIG),
			async (app, records) => {
				await mockPostRequest(app, "test");
				expect(records.filter((r) => !r.err).length).toBe(0);
			},
		);
		vi.restoreAllMocks();
	});

	test("logs success when span is recording", async () => {
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({ isRecording: () => true } as any);

		const pluginOptions = { enableByDefault: true, logSuccess: true };
		await testWithApp(
			pluginOptions,
			registerSampleRoutes(WORKING_ROUTE_CONFIG),
			async (app, records) => {
				await mockPostRequest(app, "test");
				expect(records.length).toBeGreaterThan(0);
			},
		);
		vi.restoreAllMocks();
	});

	test("logs when no active span (OTel not initialized)", async () => {
		vi.spyOn(trace, "getActiveSpan").mockReturnValue(undefined);

		const pluginOptions = { enableByDefault: true, logSuccess: true };
		await testWithApp(
			pluginOptions,
			registerSampleRoutes(WORKING_ROUTE_CONFIG),
			async (app, records) => {
				await mockPostRequest(app, "test");
				expect(records.length).toBeGreaterThan(0);
			},
		);
		vi.restoreAllMocks();
	});

	test("errors always log even when span is not recording", async () => {
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({ isRecording: () => false } as any);

		const pluginOptions = { enableByDefault: true };
		await testWithApp(
			pluginOptions,
			(app) => {
				app.get("/boom", { config: { message: "boom" } }, async () => {
					throw new Error("always log me");
				});
			},
			async (app, records) => {
				await mockGetRequest(app, "/boom");
				expect(records.find((r) => r.err)).toBeDefined();
			},
		);
		vi.restoreAllMocks();
	});
});
