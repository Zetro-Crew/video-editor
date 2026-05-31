import { Logger } from "@ztube/observability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShutdown } from "../shutdown.ts";

const makeExit = (): ReturnType<typeof vi.fn> =>
	vi.fn().mockImplementation((_code: number) => {}) as ReturnType<typeof vi.fn>;

describe("createShutdown", () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let infoSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		errorSpy = vi.spyOn(Logger, "logError").mockImplementation(() => {});
		infoSpy = vi.spyOn(Logger, "logInfo").mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
		infoSpy.mockRestore();
		vi.useRealTimers();
	});

	it("calls system.stop only once when signalled twice", async () => {
		const stop = vi.fn().mockResolvedValue(undefined);
		const exit = makeExit();
		const shutdown = createShutdown({
			system: { stop },
			exit: exit as unknown as (code: number) => never,
		});
		shutdown("SIGTERM");
		shutdown("SIGTERM");
		await new Promise((r) => setImmediate(r));
		expect(stop).toHaveBeenCalledTimes(1);
	});

	it("exits with code 0 on successful stop", async () => {
		const stop = vi.fn().mockResolvedValue(undefined);
		const exit = makeExit();
		const shutdown = createShutdown({
			system: { stop },
			exit: exit as unknown as (code: number) => never,
		});
		shutdown("SIGTERM");
		await new Promise((r) => setImmediate(r));
		await new Promise((r) => setImmediate(r));
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("exits with code 1 when stop rejects", async () => {
		const stop = vi.fn().mockRejectedValue(new Error("nope"));
		const exit = makeExit();
		const shutdown = createShutdown({
			system: { stop },
			exit: exit as unknown as (code: number) => never,
		});
		shutdown("SIGINT");
		await new Promise((r) => setImmediate(r));
		await new Promise((r) => setImmediate(r));
		expect(exit).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalledWith("[shutdown] failed", expect.any(Error));
	});

	it("exits with code 1 via timer when stop hangs past hardExitMs", async () => {
		vi.useFakeTimers();
		const stop = vi.fn().mockImplementation(() => new Promise(() => {}));
		const exit = makeExit();
		const shutdown = createShutdown({
			system: { stop },
			exit: exit as unknown as (code: number) => never,
			hardExitMs: 15_000,
		});
		shutdown("SIGTERM");
		expect(exit).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(15_001);
		expect(exit).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalledWith("[shutdown] timed out — forcing exit", expect.any(Error));
	});
});
