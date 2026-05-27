import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ZMetricsService", () => {
	const addSpy = vi.fn();
	const recordSpy = vi.fn();
	const createCounterMock = vi.fn().mockReturnValue({ add: addSpy });
	const createHistogramMock = vi.fn().mockReturnValue({ record: recordSpy });
	const getMeterMock = vi.fn().mockReturnValue({
		createCounter: createCounterMock,
		createHistogram: createHistogramMock,
	});

	beforeEach(() => {
		vi.resetModules();
		vi.doMock("@opentelemetry/api", () => ({
			metrics: {
				getMeter: getMeterMock,
			},
		}));
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.doUnmock("@opentelemetry/api");
	});

	it('should create a counter with "biz" prefix and increment it', async () => {
		const { metricsService } = await import("../open-telemetry/metrics.js");

		metricsService.init("test-service");
		metricsService.increment("login_attempts", { status: "failed" }, 1);

		expect(createCounterMock).toHaveBeenCalledWith("biz.login_attempts");
		expect(addSpy).toHaveBeenCalledWith(1, { status: "failed" });
	});

	it('should create a histogram with "biz" prefix and record value', async () => {
		const { metricsService } = await import("../open-telemetry/metrics.js");

		metricsService.init("test-service");
		metricsService.recordHistogram("processing_time", 150, { type: "batch" });

		expect(createHistogramMock).toHaveBeenCalledWith("biz.processing_time");
		expect(recordSpy).toHaveBeenCalledWith(150, { type: "batch" });
	});

	it("should cache metrics and NOT create them twice", async () => {
		const { metricsService } = await import("../open-telemetry/metrics.js");

		metricsService.init("test-service");
		metricsService.increment("user_clicks");
		metricsService.increment("user_clicks");

		expect(createCounterMock).toHaveBeenCalledTimes(1);
		expect(addSpy).toHaveBeenCalledTimes(2);
	});

	it("should use default fallback meter if init() was not called", async () => {
		const { metricsService } = await import("../open-telemetry/metrics.js");

		metricsService.increment("lazy_metric");

		expect(getMeterMock).toHaveBeenCalled();
		expect(createCounterMock).toHaveBeenCalledWith("biz.lazy_metric");
	});
});
