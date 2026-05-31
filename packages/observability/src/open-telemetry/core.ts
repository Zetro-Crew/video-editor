import { FastifyOtelInstrumentation } from "@fastify/otel";
import type { Span } from "@opentelemetry/api";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { HostMetrics } from "@opentelemetry/host-metrics";
import { AmqplibInstrumentation } from "@opentelemetry/instrumentation-amqplib";
import { AwsInstrumentation } from "@opentelemetry/instrumentation-aws-sdk";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { MongoDBInstrumentation } from "@opentelemetry/instrumentation-mongodb";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { RedisInstrumentation } from "@opentelemetry/instrumentation-redis-4";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { init as initPyroscope, start as startPyroscope, wrapWithLabels } from "@pyroscope/nodejs";
import type { ZOtelConfig } from "../config.type.js";
import { InternalLogger } from "../logger.js";
import { metricsService } from "./metrics.js";

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

let isProfilingEnabled = false;

const addShutdownHook = (sdk: NodeSDK): void => {
	const shutdown = (signal: string): void => {
		console.info(`Received ${signal}, shutting down telemetry...`);
		Promise.resolve(sdk.shutdown())
			.then(() => {
				console.info("Telemetry shut down gracefully");
				return null;
			})
			.catch((err: unknown) => {
				console.error("Error shutting down telemetry", err);
			});
	};

	process.on("SIGTERM", () => {
		shutdown("SIGTERM");
	});
	process.on("SIGINT", () => {
		shutdown("SIGINT");
	});
};

export const initTelemetry = (resource: ZOtelConfig): void => {
	const {
		serviceVersion,
		otelEndpoint,
		serviceName,
		logLevel,
		pyroscopeServerAddress,
		samplingRatio,
	} = resource;

	const sdk = new NodeSDK({
		instrumentations: [
			new HttpInstrumentation(),
			new FastifyOtelInstrumentation(),
			new AmqplibInstrumentation(),
			new AwsInstrumentation(),
			new RedisInstrumentation(),
			new MongoDBInstrumentation(),
			new PinoInstrumentation(),

			new RuntimeNodeInstrumentation({
				monitoringPrecision: 5000,
			}),
		],
		metricReader: new PeriodicExportingMetricReader({
			exporter: new OTLPMetricExporter({
				url: otelEndpoint,
			}),
			exportIntervalMillis: 5000,
		}),
		resource: resourceFromAttributes({
			[ATTR_SERVICE_VERSION]: serviceVersion,
			[ATTR_SERVICE_NAME]: serviceName,
		}),
		traceExporter: new OTLPTraceExporter({
			url: otelEndpoint,
		}),
		sampler: new TraceIdRatioBasedSampler(samplingRatio ?? 1),
	});

	sdk.start();

	InternalLogger.configure({ serviceName, level: logLevel });

	const hostMetrics = new HostMetrics({ name: "host-metrics" });
	hostMetrics.start();

	metricsService.init(serviceName);

	addShutdownHook(sdk);
	if (pyroscopeServerAddress) {
		initPyroscope({
			serverAddress: pyroscopeServerAddress,
			appName: serviceName,
			tags: {
				"service.version": serviceVersion,
			},
			wall: {
				collectCpuTime: true,
			},
		});
		isProfilingEnabled = true;

		startPyroscope();
	}

	console.info("openTelemetry initialized for ", serviceName, " at ", otelEndpoint);
};

const executeWithLabels = <T>(
	labels: Record<string, string | number>,
	span: Span,
	callback: (span: Span) => Promise<T>,
): Promise<T> => {
	if (!isProfilingEnabled) {
		return callback(span);
	}
	return new Promise<T>((resolve, reject) => {
		wrapWithLabels(labels, () => {
			callback(span)
				.then(resolve)
				.catch((err: unknown) => {
					reject(toError(err));
				});
		});
	});
};

export const addCustomSpan = <T>(
	spanName: string,
	callback: (span: Span) => Promise<T>,
): Promise<T> => {
	const tracer = trace.getTracer("z-obs-tracer");
	return tracer.startActiveSpan(spanName, async (span) => {
		const { traceId, spanId } = span.spanContext();

		const labels = {
			trace_id: traceId,
			span_id: spanId,
			profile_id: spanId,
		};

		try {
			return await executeWithLabels(labels, span, callback);
		} catch (err: unknown) {
			const error = toError(err);
			span.recordException(error);
			span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
			throw error;
		} finally {
			span.end();
		}
	});
};

export const isSampled = (): boolean => {
	const span = trace.getActiveSpan();
	return span ? span.isRecording() : true;
};

export const pyroscopeMiddleware = (_req: unknown, _res: unknown, next: () => void): void => {
	const span = trace.getSpan(context.active());
	if (span && isProfilingEnabled) {
		const { traceId, spanId } = span.spanContext();
		wrapWithLabels(
			{
				trace_id: traceId,
				span_id: spanId,
				profile_id: spanId,
			},
			next,
		);
	} else {
		next();
	}
};
