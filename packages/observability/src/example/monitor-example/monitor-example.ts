import { createZMonitor } from "../../index.js";
import type { MonitorConfig } from "../../monitor/monitor.config.js";

const config: MonitorConfig = {
	businessId: "1234-business-id",
	processName: "monitor-example",
	stageName: "monitor-example",
};
const monitor = createZMonitor(config);

const runExample = async (): Promise<void> => {
	monitor.logStarted();

	try {
		await new Promise((resolve) => setTimeout(resolve, 100));
		monitor.logSuccess({ result: "processed successfully" });
	} catch (error) {
		monitor.logAborting(error as Error);
	}

	const invalidInput = { missingUuid: true };
	monitor.logInvalidInput(invalidInput, new Error("Input validation failed"));
};

void runExample();
