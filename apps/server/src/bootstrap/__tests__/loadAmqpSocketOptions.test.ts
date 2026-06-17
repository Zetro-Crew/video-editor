import { afterEach, describe, expect, it, vi } from "vitest";

const readFileSyncMock = vi.fn();

vi.mock("node:fs", () => ({
	readFileSync: (path: string, encoding?: string) => readFileSyncMock(path, encoding),
}));

const importLoader = async () => {
	const mod = await import("../container.ts");
	return { loadAmqpSocketOptions: mod.loadAmqpSocketOptions };
};

afterEach(() => {
	readFileSyncMock.mockReset();
});

describe("loadAmqpSocketOptions", () => {
	it("returns undefined for plain amqp:// URLs", async () => {
		const { loadAmqpSocketOptions } = await importLoader();
		const result = loadAmqpSocketOptions("amqp://guest:guest@localhost:5672");
		expect(result).toBeUndefined();
		expect(readFileSyncMock).not.toHaveBeenCalled();
	});

	it("reads cert/key/ca from hardcoded paths for amqps:// URLs", async () => {
		const { loadAmqpSocketOptions } = await importLoader();
		readFileSyncMock.mockImplementation((p: string) => `pem:${p}`);

		const result = loadAmqpSocketOptions("amqps://rabbit.internal:5671");

		expect(result).toMatchObject({
			cert: "pem:/tmp/certificates/rabbitmq/rabbit_cert.pem",
			key: "pem:/tmp/certificates/rabbitmq/rabbit_key.pem",
			ca: "pem:/bundle.pem",
		});
		expect(result?.credentials).toBeDefined();
		expect(readFileSyncMock).toHaveBeenCalledWith(
			"/tmp/certificates/rabbitmq/rabbit_cert.pem",
			"utf8",
		);
		expect(readFileSyncMock).toHaveBeenCalledWith(
			"/tmp/certificates/rabbitmq/rabbit_key.pem",
			"utf8",
		);
		expect(readFileSyncMock).toHaveBeenCalledWith("/bundle.pem", "utf8");
	});

	it("propagates fs errors at boot when amqps:// files are missing", async () => {
		const { loadAmqpSocketOptions } = await importLoader();
		readFileSyncMock.mockImplementation(() => {
			throw new Error("ENOENT");
		});
		expect(() => loadAmqpSocketOptions("amqps://rabbit.internal:5671")).toThrow("ENOENT");
	}, 10000);
});
