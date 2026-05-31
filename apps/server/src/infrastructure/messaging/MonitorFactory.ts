export interface PublishMonitor {
	logStarted(): void;
	logRetry(cause: Error): void;
	logSuccess(output?: unknown): void;
	logAborting(cause: Error): void;
}

export interface PublishMonitorConfig {
	processName: string;
	businessId: string;
	stageName: string;
}

export type MonitorFactory = (config: PublishMonitorConfig, extraInfo?: object) => PublishMonitor;
