import type { Attributes, Counter, Histogram, Meter } from "@opentelemetry/api";
import { metrics } from "@opentelemetry/api";

export interface MetricsService {
	recordHistogram(metricName: string, value: number, attributes?: Attributes): void;
	increment(metricName: string, attributes?: Attributes, value?: number): void;
}

class ZMetricsService implements MetricsService {
	private histograms = new Map<string, Histogram>();
	private counters = new Map<string, Counter>();

	private meter: undefined | Meter;
	private readonly prefix = "biz";

	recordHistogram(metricName: string, value: number, attributes: Attributes = {}): void {
		const fullName = `${this.prefix}.${metricName}`;

		if (!this.histograms.has(fullName)) {
			this.histograms.set(fullName, this.getMeter().createHistogram(fullName));
		}

		this.histograms.get(fullName)?.record(value, attributes);
	}

	increment(metricName: string, attributes: Attributes = {}, value = 1): void {
		const fullName = `${this.prefix}.${metricName}`;

		if (!this.counters.has(fullName)) {
			this.counters.set(fullName, this.getMeter().createCounter(fullName));
		}

		this.counters.get(fullName)?.add(value, attributes);
	}

	init(serviceName: string): void {
		this.meter = metrics.getMeter(`${serviceName}-business-metrics`);
	}

	private getMeter(): Meter {
		return this.meter ?? metrics.getMeter("default-uninitialized");
	}
}

export const metricsService = new ZMetricsService();
