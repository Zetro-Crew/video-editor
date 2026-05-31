import { Logger } from "@ztube/observability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvConfig } from "../../config/env.ts";
import type { Container } from "../container.ts";
import type { Server } from "../server.ts";
import { System } from "../system.ts";

interface RedisFake {
	on: ReturnType<typeof vi.fn>;
	connect: ReturnType<typeof vi.fn>;
	quit: ReturnType<typeof vi.fn>;
}

interface PublisherFake {
	connect: ReturnType<typeof vi.fn>;
	drain: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
}

interface ServerFake {
	start: ReturnType<typeof vi.fn>;
	stop: ReturnType<typeof vi.fn>;
}

const makeConfig = (): EnvConfig => ({ REDIS_HOST: "h", REDIS_PORT: 1234 }) as unknown as EnvConfig;

const makeRedis = (): RedisFake => ({
	on: vi.fn(),
	connect: vi.fn().mockResolvedValue(undefined),
	quit: vi.fn().mockResolvedValue(undefined),
});

const makePublisher = (): PublisherFake => ({
	connect: vi.fn().mockResolvedValue(undefined),
	drain: vi.fn().mockResolvedValue(undefined),
	close: vi.fn().mockResolvedValue(undefined),
});

const makeServer = (): ServerFake => ({
	start: vi.fn().mockResolvedValue(undefined),
	stop: vi.fn().mockResolvedValue(undefined),
});

const makeContainer = (redis: RedisFake, publisher: PublisherFake): Container =>
	({ redis, exportEventPublisher: publisher }) as unknown as Container;

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

	it("calls redis.connect → publisher.connect → server.start on happy path", async () => {
		const redis = makeRedis();
		const publisher = makePublisher();
		const server = makeServer();
		const calls: string[] = [];
		redis.connect.mockImplementation(async () => {
			calls.push("redis.connect");
		});
		publisher.connect.mockImplementation(async () => {
			calls.push("publisher.connect");
		});
		server.start.mockImplementation(async () => {
			calls.push("server.start");
		});

		const system = new System(
			makeConfig(),
			makeContainer(redis, publisher),
			server as unknown as Server,
		);
		await system.start();
		expect(calls).toEqual(["redis.connect", "publisher.connect", "server.start"]);
	});

	it("quits redis when publisher.connect throws and rethrows", async () => {
		const redis = makeRedis();
		const publisher = makePublisher();
		const server = makeServer();
		publisher.connect.mockRejectedValueOnce(new Error("amqp down"));

		const system = new System(
			makeConfig(),
			makeContainer(redis, publisher),
			server as unknown as Server,
		);

		await expect(system.start()).rejects.toThrow("amqp down");
		expect(redis.quit).toHaveBeenCalledTimes(1);
		expect(server.start).not.toHaveBeenCalled();
	});

	it("closes publisher and quits redis when server.start throws and rethrows", async () => {
		const redis = makeRedis();
		const publisher = makePublisher();
		const server = makeServer();
		server.start.mockRejectedValueOnce(new Error("port in use"));

		const system = new System(
			makeConfig(),
			makeContainer(redis, publisher),
			server as unknown as Server,
		);

		await expect(system.start()).rejects.toThrow("port in use");
		expect(publisher.close).toHaveBeenCalledTimes(1);
		expect(redis.quit).toHaveBeenCalledTimes(1);
	});

	it("does NOT call publisher.close when publisher.connect itself throws", async () => {
		const redis = makeRedis();
		const publisher = makePublisher();
		const server = makeServer();
		publisher.connect.mockRejectedValueOnce(new Error("amqp down"));

		const system = new System(
			makeConfig(),
			makeContainer(redis, publisher),
			server as unknown as Server,
		);

		await expect(system.start()).rejects.toThrow("amqp down");
		expect(publisher.close).not.toHaveBeenCalled();
		expect(redis.quit).toHaveBeenCalledTimes(1);
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

	it("calls server.stop → publisher.drain(5000) → publisher.close → redis.quit on happy path", async () => {
		const redis = makeRedis();
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
		redis.quit.mockImplementation(async () => {
			calls.push("redis.quit");
		});

		const system = new System(
			makeConfig(),
			makeContainer(redis, publisher),
			server as unknown as Server,
		);
		await system.stop();
		expect(calls).toEqual([
			"server.stop",
			"publisher.drain(5000)",
			"publisher.close",
			"redis.quit",
		]);
	});

	it("continues to publisher.close and redis.quit when drain rejects", async () => {
		const redis = makeRedis();
		const publisher = makePublisher();
		const server = makeServer();
		publisher.drain.mockRejectedValueOnce(new Error("drain blew up"));

		const system = new System(
			makeConfig(),
			makeContainer(redis, publisher),
			server as unknown as Server,
		);
		await system.stop();
		expect(publisher.close).toHaveBeenCalledTimes(1);
		expect(redis.quit).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledWith("[shutdown] publisher drain failed", expect.any(Error));
	});

	it("continues to redis.quit when publisher.close rejects", async () => {
		const redis = makeRedis();
		const publisher = makePublisher();
		const server = makeServer();
		publisher.close.mockRejectedValueOnce(new Error("close blew up"));

		const system = new System(
			makeConfig(),
			makeContainer(redis, publisher),
			server as unknown as Server,
		);
		await system.stop();
		expect(redis.quit).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledWith("[shutdown] publisher close failed", expect.any(Error));
	});
});
