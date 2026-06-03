import { afterEach, describe, expect, it, vi } from "vitest";

const readFileSyncMock = vi.fn();

vi.mock("node:fs", () => ({
	readFileSync: (path: string) => readFileSyncMock(path),
}));

const importLoader = async () => {
	const mod = await import("../container.ts");
	return mod.loadAmqpSocketOptions;
};

afterEach(() => {
	readFileSyncMock.mockReset();
});

describe("loadAmqpSocketOptions", () => {
	it("returns undefined for plain amqp:// URLs", async () => {
		const loadAmqpSocketOptions = await importLoader();
		const result = loadAmqpSocketOptions("amqp://guest:guest@localhost:5672");
		expect(result).toBeUndefined();
		expect(readFileSyncMock).not.toHaveBeenCalled();
	});

	it("reads cert/key/ca from hardcoded paths for amqps:// URLs", async () => {
		const loadAmqpSocketOptions = await importLoader();
		readFileSyncMock.mockImplementation((p: string) => Buffer.from(`pem:${p}`));

		const result = loadAmqpSocketOptions("amqps://rabbit.internal:5671");

		expect(result).toEqual({
			cert: Buffer.from("pem:/tmp/certificates/rabbitmq/rabbit_cert.pem"),
			key: Buffer.from("pem:/tmp/certificates/rabbitmq/rabbit_key.pem"),
			ca: Buffer.from("pem:/bundle.pem"),
		});
		expect(readFileSyncMock).toHaveBeenCalledWith("/tmp/certificates/rabbitmq/rabbit_cert.pem");
		expect(readFileSyncMock).toHaveBeenCalledWith("/tmp/certificates/rabbitmq/rabbit_key.pem");
		expect(readFileSyncMock).toHaveBeenCalledWith("/bundle.pem");
	});

	it("propagates fs errors at boot when amqps:// files are missing", async () => {
		const loadAmqpSocketOptions = await importLoader();
		readFileSyncMock.mockImplementation(() => {
			throw new Error("ENOENT");
		});
		expect(() => loadAmqpSocketOptions("amqps://rabbit.internal:5671")).toThrow("ENOENT");
	});
});
