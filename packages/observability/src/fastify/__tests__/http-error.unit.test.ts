import { stdSerializers } from "pino";
import { describe, expect, test } from "vitest";
import { HttpError } from "../fastify.errors.js";

describe("HttpError", () => {
	test("statusCode + message are stored on the instance", () => {
		const err = new HttpError({ statusCode: 404, message: "not found" });
		expect(err.statusCode).toBe(404);
		expect(err.message).toBe("not found");
		expect(err.name).toBe("HttpError");
	});

	test("expose defaults to true for 4xx", () => {
		const err = new HttpError({ statusCode: 400, message: "bad" });
		expect(err.expose).toBe(true);
	});

	test("expose defaults to false for 5xx", () => {
		const err = new HttpError({ statusCode: 503, message: "down" });
		expect(err.expose).toBe(false);
	});

	test("explicit expose=false overrides 4xx default", () => {
		const err = new HttpError({ statusCode: 400, message: "bad", expose: false });
		expect(err.expose).toBe(false);
	});

	test("explicit expose=true overrides 5xx default", () => {
		const err = new HttpError({ statusCode: 500, message: "boom", expose: true });
		expect(err.expose).toBe(true);
	});

	test("details stored on instance", () => {
		const details = { size: 100, maxSize: 50 };
		const err = new HttpError({ statusCode: 413, message: "too big", details });
		expect(err.details).toEqual(details);
	});

	test("cause is chained via native Error.cause", () => {
		const root = new Error("root");
		const err = new HttpError({ statusCode: 500, message: "wrapper", cause: root });
		expect(err.cause).toBe(root);
	});

	test("undefined cause does not set cause property", () => {
		const err = new HttpError({ statusCode: 400, message: "no cause" });
		expect(err.cause).toBeUndefined();
	});
});

describe("HttpError + Pino stdSerializers.err", () => {
	test("serializer preserves statusCode + details (enumerable own props) and captures cause inline", () => {
		class PublishExhaustedError extends Error {
			constructor() {
				super("exhausted");
				this.name = "PublishExhaustedError";
			}
		}
		const err = new HttpError({
			statusCode: 503,
			message: "render queue unavailable",
			cause: new PublishExhaustedError(),
			details: { attempts: 3 },
		});

		const serialized = stdSerializers.err(err) as Record<string, unknown> & {
			stack?: string;
		};

		expect(serialized.statusCode).toBe(503);
		expect(serialized.details).toEqual({ attempts: 3 });
		// pino merges cause into message + stack rather than emitting a structured field
		expect(serialized.stack).toContain("PublishExhaustedError");
	});
});
