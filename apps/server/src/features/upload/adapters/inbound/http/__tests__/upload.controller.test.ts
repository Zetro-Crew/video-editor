import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { silentLogger } from "../../../../../../infrastructure/fastify/__tests__/silent-logger.ts";
import {
	createFastifyInstance,
	type TypedFastify,
} from "../../../../../../infrastructure/fastify/fastify.ts";
import {
	UploadTooLargeError,
	type UploadUseCase,
} from "../../../../application/use-cases/UploadUseCase.ts";
import { uploadController } from "../upload.controller.ts";

function makeUseCase(
	getSignedUrl: UploadUseCase["getSignedUrl"] = vi.fn().mockResolvedValue({
		uploadUrl: "internal://signed",
		s3Key: "uploads/abc.mp4",
		filename: "abc.mp4",
		publicUrl: "internal://public",
	}),
): UploadUseCase {
	return { getSignedUrl } as unknown as UploadUseCase;
}

describe("uploadController", () => {
	let app: TypedFastify;

	beforeEach(() => {
		app = createFastifyInstance({ loggerInstance: silentLogger });
	});

	afterEach(async () => {
		await app.close();
	});

	it("happy path returns 200 with signed url payload", async () => {
		await app.register(uploadController, { uploadUseCase: makeUseCase() });
		await app.ready();

		const res = await app.inject({
			method: "POST",
			url: "/upload/signed-url",
			payload: { filename: "movie.mp4", mimetype: "video/mp4", size: 100 },
		});

		expect(res.statusCode).toBe(200);
	});

	it("400 + only { error } when file type not allowed", async () => {
		await app.register(uploadController, { uploadUseCase: makeUseCase() });
		await app.ready();

		const res = await app.inject({
			method: "POST",
			url: "/upload/signed-url",
			payload: { filename: "bad.exe", mimetype: "application/x-msdownload", size: 100 },
		});

		expect(res.statusCode).toBe(400);
		const body = res.json() as Record<string, unknown>;
		expect(Object.keys(body)).toEqual(["error"]);
		expect(body.error).toMatch(/File type not allowed/);
	});

	it("413 + size message when UploadTooLargeError thrown", async () => {
		const useCase = makeUseCase(
			vi.fn().mockRejectedValue(new UploadTooLargeError(1000, 500)) as never,
		);
		await app.register(uploadController, { uploadUseCase: useCase });
		await app.ready();

		const res = await app.inject({
			method: "POST",
			url: "/upload/signed-url",
			payload: { filename: "movie.mp4", mimetype: "video/mp4", size: 1000 },
		});

		expect(res.statusCode).toBe(413);
		const body = res.json() as Record<string, unknown>;
		expect(Object.keys(body)).toEqual(["error"]);
		expect(body.error).toBe("Upload size 1000 exceeds max 500");
	});

	it("unexpected error → 500 with { error: 'Internal error' } (no leak of error.message)", async () => {
		const useCase = makeUseCase(
			vi.fn().mockRejectedValue(new Error("internal db connection lost")) as never,
		);
		await app.register(uploadController, { uploadUseCase: useCase });
		await app.ready();

		const res = await app.inject({
			method: "POST",
			url: "/upload/signed-url",
			payload: { filename: "movie.mp4", mimetype: "video/mp4", size: 100 },
		});

		expect(res.statusCode).toBe(500);
		expect(res.json()).toEqual({ error: "Internal error" });
	});
});
