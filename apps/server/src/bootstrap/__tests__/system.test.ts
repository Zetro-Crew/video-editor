import { Logger } from "@ztube/observability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEnvConfig } from "../../config/env.ts";
import type { ApiContainer } from "../container.ts";
import type { Server } from "../server.ts";
import { System } from "../system.ts";

interface PublisherFake {
	connect: ReturnType<typeof vi.fn>;
	drain: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
}

interface ServerFake {
	start: ReturnType<typeof vi.fn>;
	stop: ReturnType<typeof vi.fn>;
}

const makeConfig = (): ApiEnvConfig => ({}) as unknown as ApiEnvConfig;

const makePublisher = (): PublisherFake => ({
	connect: vi.fn().mockResolvedValue(undefined),
	drain: vi.fn().mockResolvedValue(undefined),
	close: vi.fn().mockResolvedValue(undefined),
});

const makeServer = (): ServerFake => ({
	start: vi.fn().mockResolvedValue(undefined),
	stop: vi.fn().mockResolvedValue(undefined),
});

const makeContainer = (publisher: PublisherFake): ApiContainer =>
	({ exportEventPublisher: publisher }) as unknown as ApiContainer;

describe("System.start", () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let infoSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		errorSpy = vi.spyOn(Logger, "logError").mockImplementation(() => {});
		infoSpy = vi.spyOn(Logger, "logInfo").mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
		infoSpy.mockRestore();
	});

	it("calls publisher.connect → server.start on happy path", async () => {
		const publisher = makePublisher();
		const server = makeServer();
		const calls: string[] = [];
		publisher.connect.mockImplementation(async () => {
			calls.push("publisher.connect");
		});
		server.start.mockImplementation(async () => {
			calls.push("server.start");
		});

		const system = new System(makeConfig(), makeContainer(publisher), server as unknown as Server);
		await system.start();
		expect(calls).toEqual(["publisher.connect", "server.start"]);
	});

	it("rethrows when publisher.connect throws and does not call publisher.close", async () => {
		const publisher = makePublisher();
		const server = makeServer();
		publisher.connect.mockRejectedValueOnce(new Error("amqp down"));

		const system = new System(makeConfig(), makeContainer(publisher), server as unknown as Server);

		await expect(system.start()).rejects.toThrow("amqp down");
		expect(publisher.close).not.toHaveBeenCalled();
		expect(server.start).not.toHaveBeenCalled();
	});

	it("closes publisher when server.start throws and rethrows", async () => {
		const publisher = makePublisher();
		const server = makeServer();
		server.start.mockRejectedValueOnce(new Error("port in use"));

		const system = new System(makeConfig(), makeContainer(publisher), server as unknown as Server);

		await expect(system.start()).rejects.toThrow("port in use");
		expect(publisher.close).toHaveBeenCalledTimes(1);
	});
});

describe("System.stop", () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let infoSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		errorSpy = vi.spyOn(Logger, "logError").mockImplementation(() => {});
		infoSpy = vi.spyOn(Logger, "logInfo").mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
		infoSpy.mockRestore();
	});

	it("calls server.stop → publisher.drain(5000) → publisher.close on happy path", async () => {
		const publisher = makePublisher();
		const server = makeServer();
		const calls: string[] = [];
		server.stop.mockImplementation(async () => {
			calls.push("server.stop");
		});
		publisher.drain.mockImplementation(async (ms: number) => {
			calls.push(`publisher.drain(${ms})`);
		});
		publisher.close.mockImplementation(async () => {
			calls.push("publisher.close");
		});

		const system = new System(makeConfig(), makeContainer(publisher), server as unknown as Server);
		await system.stop();
		expect(calls).toEqual(["server.stop", "publisher.drain(5000)", "publisher.close"]);
	});

	it("continues to publisher.close when drain rejects", async () => {
		const publisher = makePublisher();
		const server = makeServer();
		publisher.drain.mockRejectedValueOnce(new Error("drain blew up"));

		const system = new System(makeConfig(), makeContainer(publisher), server as unknown as Server);
		await system.stop();
		expect(publisher.close).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledWith("[shutdown] publisher drain failed", expect.any(Error));
	});

	it("logs error when publisher.close rejects", async () => {
		const publisher = makePublisher();
		const server = makeServer();
		publisher.close.mockRejectedValueOnce(new Error("close blew up"));

		const system = new System(makeConfig(), makeContainer(publisher), server as unknown as Server);
		await system.stop();
		expect(errorSpy).toHaveBeenCalledWith("[shutdown] publisher close failed", expect.any(Error));
	});
});
