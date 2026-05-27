import type { DestinationStream } from "pino";

export interface Monitor {
	logInvalidInput(input: unknown, invalidity: Error): void;
	logSuccess(output?: unknown): void;
	logAborting(cause: Error): void;
	logRetry(cause: Error): void;
	logStarted(): void;
}

export interface MonitorConfig {
	customDestination?: DestinationStream;
	processName: string;
	businessId: string;
	stageName: string;
}

export const MONITOR_STATUS = {
	STARTED: "started",
	SUCCESS: "success",
	ABORTING: "abort",
	RETRY: "retry",
};
