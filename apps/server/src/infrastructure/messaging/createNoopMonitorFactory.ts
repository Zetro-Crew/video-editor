import type { MonitorFactory } from "./MonitorFactory.ts";

export const createNoopMonitorFactory = (): MonitorFactory => () => ({
	logStarted: () => {},
	logRetry: () => {},
	logSuccess: () => {},
	logAborting: () => {},
});
