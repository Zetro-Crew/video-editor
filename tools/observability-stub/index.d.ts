// Type surface for the no-op @ztube/observability stub. Mirrors only the parts
// of the real SDK that apps/server consumes. Keep in sync when server usage
// adds or changes an export. See README.md.

import type { FastifyBaseLogger } from "fastify";

export interface HistogramView {
	instrumentName: string;
	boundaries: number[];
}

export interface InitTelemetryOptions {
	serviceName: string;
	serviceVersion: string;
	otelEndpoint: string;
	logLevel: string;
	histogramViews?: HistogramView[];
}

export function initTelemetry(options: InitTelemetryOptions): void;

// `info` is `object` to match the real SDK's LoggerPort: callers pass concrete
// interfaces (e.g. AmqpErrorLogFields) that lack a string index signature, so a
// `Record<string, unknown>` param would reject them.
export declare const Logger: {
	logInfo(message: string, info?: object): void;
	logError(message: string, error: Error, info?: object): void;
	logWarning(message: string, info?: object): void;
	getInstance(): FastifyBaseLogger;
};

export declare const metricsService: {
	recordHistogram(
		name: string,
		value: number,
		attributes?: Record<string, string | number | boolean>,
	): void;
};

type SpanAttributeValue = string | number | boolean | string[] | number[] | boolean[];

export interface Span {
	setAttribute(key: string, value: SpanAttributeValue): void;
	setAttributes(attributes: Record<string, SpanAttributeValue>): void;
}

export function addCustomSpan<T>(name: string, callback: (span: Span) => Promise<T>): Promise<T>;

export interface ZMonitorConfig {
	processName: string;
	businessId: string;
	stageName: string;
}

export interface ZMonitor {
	logStarted(): void;
	logRetry(cause: Error): void;
	logSuccess(output?: unknown): void;
	logAborting(cause: Error): void;
}

export function createZMonitor(config: ZMonitorConfig, extraInfo?: object): ZMonitor;
