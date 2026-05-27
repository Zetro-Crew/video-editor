import type { LoggerPort } from "../config.type.js";
import { LoggerManager } from "../logger.js";
import { isSampled } from "../open-telemetry/core.js";
import { MONITOR_STATUS, type Monitor, type MonitorConfig } from "./monitor.config.js";

export const createZtestMonitor = (): ZMonitor => {
	const noopLogger = LoggerManager.create({ level: "silent" });
	return new ZMonitor(noopLogger, { processName: "test", businessId: "test", stageName: "test" });
};

export const createZMonitor = (config: MonitorConfig, extraInfo?: object): ZMonitor => {
	const { processName: serviceName, customDestination } = config;
	const logger = LoggerManager.create({ customDestination, serviceName });
	return new ZMonitor(logger, config, extraInfo);
};

export class ZMonitor implements Monitor {
	private startHrTime: undefined | bigint;

	constructor(
		private readonly logger: LoggerPort,
		private readonly config: MonitorConfig,
		private readonly extraInfo?: object,
	) {}

	logInvalidInput(input: unknown, invalidity: Error): void {
		this.log(
			"error",
			"invalid process stage input",
			{
				status: MONITOR_STATUS.ABORTING,
				rawInput: input,
			},
			invalidity,
		);
	}

	logStarted(): void {
		this.startHrTime = process.hrtime.bigint();
		this.log("info", "started process stage", {
			status: MONITOR_STATUS.STARTED,
		});
	}

	logRetry(cause: Error): void {
		this.log("warn", "retrying process stage", {
			status: MONITOR_STATUS.RETRY,
			error: cause.message,
		});
	}

	logSuccess(output?: unknown): void {
		this.log("info", "success in process stage", {
			status: MONITOR_STATUS.SUCCESS,
			output,
		});
	}

	logAborting(cause: Error): void {
		this.log(
			"error",
			"aborting process stage",
			{
				status: MONITOR_STATUS.ABORTING,
			},
			cause,
		);
	}

	private log(
		level: "error" | "info" | "warn",
		msg: string,
		extra: object = {},
		err?: Error,
	): void {
		if (level !== "error" && !isSampled()) return;

		const { processName, businessId, stageName } = this.config;
		const durationMs = this.startHrTime
			? Number(process.hrtime.bigint() - this.startHrTime) / 1_000_000
			: undefined;
		const payload = { processName, businessId, durationMs, stageName, ...this.extraInfo, ...extra };

		if (level === "error" && err) {
			this.logger.logError(msg, err, payload);
		} else if (level === "warn") {
			this.logger.logWarning(msg, payload);
		} else {
			this.logger.logInfo(msg, payload);
		}
	}
}
