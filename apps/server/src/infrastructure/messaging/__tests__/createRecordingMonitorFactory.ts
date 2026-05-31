import type { MonitorFactory, PublishMonitor, PublishMonitorConfig } from "../MonitorFactory.ts";

type MonitorEvent =
	| { type: "started"; config: PublishMonitorConfig; extra?: object }
	| { type: "retry"; config: PublishMonitorConfig; error: Error }
	| { type: "success"; config: PublishMonitorConfig }
	| { type: "aborting"; config: PublishMonitorConfig; error: Error };

export interface RecordingMonitorFactory {
	factory: MonitorFactory;
	events: MonitorEvent[];
}

export const createRecordingMonitorFactory = (): RecordingMonitorFactory => {
	const events: MonitorEvent[] = [];
	const factory: MonitorFactory = (
		config: PublishMonitorConfig,
		extra?: object,
	): PublishMonitor => ({
		logStarted: () => {
			events.push({ type: "started", config, extra });
		},
		logRetry: (cause: Error) => {
			events.push({ type: "retry", config, error: cause });
		},
		logSuccess: () => {
			events.push({ type: "success", config });
		},
		logAborting: (cause: Error) => {
			events.push({ type: "aborting", config, error: cause });
		},
	});
	return { factory, events };
};
