import { trace } from "@opentelemetry/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MONITOR_STATUS } from "../monitor/monitor.config.js";
import { ZMonitor } from "../monitor/monitor.js";

/**
 * Factory פשוט ליצירת לוגר ממוקמק.
 * שימוש ב-vi.fn() מבטיח ששום דבר לא יודפס לקונסול בזמן הטסט.
 */
const createMockLogger = () => ({
	logInfo: vi.fn(),
	logWarning: vi.fn(),
	logError: vi.fn(),
	createChild: vi.fn(),
	getInstance: vi.fn(),
	setLevel: vi.fn(),
});

// describe.concurrent גורם לכל ה-it בפנים לרוץ במקביל
describe.concurrent("ZMonitor - Behavioral Tests", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});
	const MONITOR_CONFIG = {
		processName: "RabbitWorker",
		stageName: "test-stage",
		businessId: "uuid-12345",
	};

	it("should capture starting timestamp and log initial state", () => {
		const logger = createMockLogger();
		const monitor = new ZMonitor(logger, MONITOR_CONFIG);

		monitor.logStarted();

		expect(logger.logInfo).toHaveBeenCalledWith(
			expect.stringContaining(MONITOR_STATUS.STARTED),
			expect.objectContaining({
				businessId: MONITOR_CONFIG.businessId,
				status: MONITOR_STATUS.STARTED,
			}),
		);
	});

	it("should calculate precise duration using monotonic clock on success", async () => {
		let fakeTimeNs = 1_000_000_000n;
		const hrtimeSpy = vi.spyOn(process.hrtime, "bigint").mockImplementation(() => fakeTimeNs);
		const logger = createMockLogger();
		const monitor = new ZMonitor(logger, MONITOR_CONFIG);

		monitor.logStarted();
		fakeTimeNs += 100_000_000n;
		monitor.logSuccess({ result: "ok" });

		const logData = logger.logInfo.mock.calls.find(
			(c) => c[1].status === MONITOR_STATUS.SUCCESS,
		)?.[1];
		expect(logData?.durationMs).toBe(100);
		hrtimeSpy.mockRestore();
	});

	it("should ensure logs are correlated with OTel traceId when active", () => {
		const logger = createMockLogger();
		const monitor = new ZMonitor(logger, MONITOR_CONFIG);
		const MOCK_TRACE_ID = "trace-8888";
		vi.spyOn(trace, "getSpan").mockReturnValue({
			spanContext: () => ({ traceId: MOCK_TRACE_ID }),
		} as any);

		monitor.logStarted();

		expect(logger.logInfo).toHaveBeenCalled();
		const payload = logger.logInfo.mock.calls[0][1];
		expect(payload.businessId).toBe(MONITOR_CONFIG.businessId);
	});

	it("should include error details and business ID when process is aborted", () => {
		const logger = createMockLogger();
		const monitor = new ZMonitor(logger, MONITOR_CONFIG);
		const error = new Error("Connection Timeout");

		monitor.logStarted();
		monitor.logAborting(error);

		expect(logger.logError).toHaveBeenCalledWith(
			expect.any(String),
			error,
			expect.objectContaining({
				businessId: MONITOR_CONFIG.businessId,
				status: MONITOR_STATUS.ABORTING,
			}),
		);
	});
});

describe("ZMonitor - Spy-based Sequential Tests", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const MONITOR_CONFIG = {
		processName: "RabbitWorker",
		stageName: "test-stage",
		businessId: "uuid-12345",
	};

	it("should suppress info/warn logs when span is not recording (sampled out by OTel)", () => {
		const logger = createMockLogger();
		const monitor = new ZMonitor(logger, MONITOR_CONFIG);

		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			isRecording: () => false,
			spanContext: () => ({ traceId: "", spanId: "", traceFlags: 0 }),
		} as any);

		monitor.logStarted();
		monitor.logSuccess();
		monitor.logRetry(new Error("retry"));

		expect(logger.logInfo).not.toHaveBeenCalled();
		expect(logger.logWarning).not.toHaveBeenCalled();
	});

	it("should always log errors even when span is not recording", () => {
		const logger = createMockLogger();
		const monitor = new ZMonitor(logger, MONITOR_CONFIG);

		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			isRecording: () => false,
			spanContext: () => ({ traceId: "", spanId: "", traceFlags: 0 }),
		} as any);

		monitor.logAborting(new Error("abort!"));
		monitor.logInvalidInput("bad", new Error("invalid"));

		expect(logger.logError).toHaveBeenCalledTimes(2);
	});

	it("should log when no active span (OTel not initialized)", () => {
		const logger = createMockLogger();
		const monitor = new ZMonitor(logger, MONITOR_CONFIG);

		vi.spyOn(trace, "getActiveSpan").mockReturnValue(undefined);

		monitor.logStarted();
		expect(logger.logInfo).toHaveBeenCalledOnce();
	});
});
