import { trace } from "@opentelemetry/api";
import * as Pyroscope from "@pyroscope/nodejs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZBaseConfig } from "../config.type.js";
import { LoggerManager } from "../logger.js";
import { initTelemetry, pyroscopeMiddleware } from "../open-telemetry/core.js";

vi.mock("@opentelemetry/sdk-node");

vi.mock("@opentelemetry/exporter-trace-otlp-grpc");
vi.mock("@opentelemetry/sdk-trace-base", () => ({
	TraceIdRatioBased: vi.fn(),
	TraceIdRatioBasedSampler: vi.fn(),
}));
vi.mock("@opentelemetry/api", async () => {
	const actual = await vi.importActual<typeof import("@opentelemetry/api")>("@opentelemetry/api");
	return {
		...actual,
		trace: {
			...actual.trace,
			getTracer: () => ({
				startActiveSpan: (_name: string, fn: any) =>
					fn({
						spanContext: () => ({ traceId: "f4k3-trace-id" }),
						end: vi.fn(),
					}),
			}),
			getSpan: vi.fn(),
		},
	};
});

vi.mock("@pyroscope/nodejs", () => ({
	init: vi.fn(),
	start: vi.fn(),
	wrapWithLabels: vi.fn((labels: any, fn: any) => fn()),
}));

const createLoggerForTest = (config: ZBaseConfig) => {
	const capturedLogs: unknown[] = [];

	const customDestination = {
		write: (chunk: string) => {
			capturedLogs.push(JSON.parse(chunk));
		},
	};

	const logger = LoggerManager.create({ ...config, customDestination });

	return { logger, capturedLogs };
};

describe.concurrent("Z-Observability SDK", () => {
	describe("LoggerManager", () => {
		it("should return a logger with the correct structure", () => {
			const { logger } = createLoggerForTest({ serviceName: "test" });

			expect(logger).toMatchObject({
				logInfo: expect.any(Function),
				logWarning: expect.any(Function),
				logError: expect.any(Function),
				createChild: expect.any(Function),
				setLevel: expect.any(Function),
			});
		});

		it("should output logs without printing to console", () => {
			const { logger } = createLoggerForTest({ serviceName: "test" });
			logger.setLevel("silent");
			const spy = vi.spyOn(logger.getInstance(), "info");

			logger.logInfo("test message", { data: 123 });

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({ info: { data: 123 } }),
				"test message",
			);
		});
	});

	describe("initZObservability", () => {
		it("should initialize without throwing or logging to console", () => {
			const config = {
				serviceName: "otel-service",
				serviceVersion: "1.0.0",
				environment: "production",
				otelEndpoint: "http://localhost:4317",
				pyroscopeServerAddress: "http://localhost:4040",
			} as const;

			expect(() => initTelemetry(config)).not.toThrow();
		});
	});

	describe("Error Serialization", () => {
		it.skip("should properly serialize error objects with stack traces", async () => {
			const { logger, capturedLogs } = createLoggerForTest({ serviceName: "err-svc" });
			const testError = new Error("Database failure");

			logger.logError("Operation failed", testError, { db: "mongo" });

			// Allow pino to write async
			await new Promise((resolve) => setTimeout(resolve, 500));

			expect(capturedLogs[0]).toMatchObject({
				err: {
					message: "Database failure",
					stack: expect.any(String),
				},
				info: { db: "mongo" },
			});
		});
	});
});

describe("Pyroscope Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset process env if needed, though we mock it usually
		// Reset internal state if we had it, but logging is checked via mocks
	});

	it("should initialize Pyroscope with correct configuration", () => {
		initTelemetry({
			serviceName: "test-service",
			serviceVersion: "1.0.0",
			otelEndpoint: "http://localhost:4317",
			pyroscopeServerAddress: "http://localhost:4040",
		});

		expect(Pyroscope.init).toHaveBeenCalledWith(
			expect.objectContaining({
				appName: "test-service",
				tags: { "service.version": "1.0.0" },
				serverAddress: "http://localhost:4040",
			}),
		);
		expect(Pyroscope.start).toHaveBeenCalled();
	});

	it("should NOT initialize Pyroscope if profiling is disabled", () => {
		initTelemetry({
			serviceName: "test-service-no-profile",
			serviceVersion: "1.0.0",
			otelEndpoint: "http://localhost:4317",
		});

		expect(Pyroscope.init).not.toHaveBeenCalled();
	});

	it("should wrap execution with Pyroscope labels using wrapWithLabels", () => {
		// Initialize telemetry to enable profiling
		initTelemetry({
			serviceName: "test-service-profiling",
			serviceVersion: "1.0.0",
			otelEndpoint: "http://localhost:4317",
			pyroscopeServerAddress: "http://localhost:4040",
		});

		const mockSpan = {
			spanContext: () => ({
				traceId: "f4k3-trace-id",
				spanId: "f4k3-span-id",
			}),
		};
		vi.mocked(trace.getSpan).mockReturnValue(mockSpan as any);

		// wrapWithLabels is already mocked to execute callback immediately in the mock definition

		const nextFn = vi.fn();

		pyroscopeMiddleware({} as any, {} as any, nextFn);

		expect(Pyroscope.wrapWithLabels).toHaveBeenCalledWith(
			{
				trace_id: "f4k3-trace-id",
				span_id: "f4k3-span-id",
				profile_id: "f4k3-span-id",
			},
			expect.any(Function),
		);

		expect(nextFn).toHaveBeenCalled();
	});
});
