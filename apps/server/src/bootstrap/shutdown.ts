import { Logger } from "@ztube/observability";
import type { System } from "./system.ts";

export interface ShutdownDeps {
	system: Pick<System, "stop">;
	exit?: (code: number) => never;
	hardExitMs?: number;
}

export const createShutdown = (deps: ShutdownDeps): ((signal: string) => void) => {
	const exit = deps.exit ?? ((code: number) => process.exit(code));
	const hardExitMs = deps.hardExitMs ?? 15_000;
	let shutdownInFlight = false;

	return (signal: string): void => {
		if (shutdownInFlight) return;
		shutdownInFlight = true;
		Logger.logInfo(`[shutdown] received ${signal}`);

		const hardTimer = setTimeout(() => {
			Logger.logError("[shutdown] timed out — forcing exit", new Error("shutdown timeout"));
			exit(1);
		}, hardExitMs);
		hardTimer.unref?.();

		deps.system
			.stop()
			.then(() => {
				clearTimeout(hardTimer);
				Logger.logInfo("[shutdown] complete");
				exit(0);
			})
			.catch((err: unknown) => {
				clearTimeout(hardTimer);
				Logger.logError("[shutdown] failed", err instanceof Error ? err : new Error(String(err)));
				exit(1);
			});
	};
};
