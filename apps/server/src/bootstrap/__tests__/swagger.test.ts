import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { previewController } from "../../features/preview/adapters/inbound/http/preview.controller.ts";
import { renderController } from "../../features/render/adapters/inbound/http/render.controller.ts";
import { uploadController } from "../../features/upload/adapters/inbound/http/upload.controller.ts";
import { silentLogger } from "../../infrastructure/fastify/__tests__/silent-logger.ts";
import { createFastifyInstance, type TypedFastify } from "../../infrastructure/fastify/fastify.ts";
import type { StoragePort } from "../../shared/application/ports/outbound/StoragePort.ts";

const stubConfig = {
	SERVER_BASE_URL: "https://api.example.com",
	SERVER_PUBLIC_PATH_PREFIX: "/api/video_editor/server",
	SERVICE_VERSION: "9.9.9",
	CORE_BASE_URL: "https://core.example.com",
	PREVIEW_SIGNING_SECRET: "x".repeat(32),
	MAX_PREVIEW_DURATION_MS: 60_000,
	PREVIEW_JOB_TTL_SECONDS: 3600,
	S3_PREVIEW_PREFIX: "preview",
} as unknown as Parameters<typeof previewController>[1]["config"];

const stubStorage = {} as unknown as StoragePort;
const stubUploadUseCase = {} as unknown as Parameters<typeof uploadController>[1]["uploadUseCase"];
const stubRenderCommandPort = {
	enqueueRender: vi.fn().mockResolvedValue(undefined),
} as unknown as Parameters<typeof renderController>[1]["renderCommandPort"];

const buildApp = async (): Promise<TypedFastify> => {
	const app = createFastifyInstance({ loggerInstance: silentLogger });
	await app.register(swagger, {
		openapi: {
			openapi: "3.0.3",
			info: { title: "Video Editor Server", version: stubConfig.SERVICE_VERSION },
			servers: [
				{
					url: `${stubConfig.SERVER_BASE_URL}${stubConfig.SERVER_PUBLIC_PATH_PREFIX}`,
				},
			],
		},
		transform: jsonSchemaTransform,
	});
	await app.register(swaggerUI, { routePrefix: "/docs" });
	app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());
	app.get("/health", { schema: { hide: true } }, async () => ({ status: "ok" }));
	await app.register(uploadController, { uploadUseCase: stubUploadUseCase });
	await app.register(renderController, { renderCommandPort: stubRenderCommandPort });
	await app.register(previewController, { storage: stubStorage, config: stubConfig });
	await app.ready();
	return app;
};

describe("swagger", () => {
	let app: TypedFastify;

	beforeEach(async () => {
		app = await buildApp();
	});

	afterEach(async () => {
		await app.close();
	});

	it("GET /openapi.json includes public routes", async () => {
		const res = await app.inject({ method: "GET", url: "/openapi.json" });
		expect(res.statusCode).toBe(200);
		const spec = res.json() as { paths: Record<string, unknown> };
		expect(spec.paths["/upload/signed-url"]).toBeDefined();
		expect(spec.paths["/render"]).toBeDefined();
		expect(spec.paths["/editor/preview-source"]).toBeDefined();
	});

	it("GET /openapi.json excludes hidden routes", async () => {
		const res = await app.inject({ method: "GET", url: "/openapi.json" });
		const spec = res.json() as { paths: Record<string, unknown> };
		expect(spec.paths["/editor/segment"]).toBeUndefined();
		expect(spec.paths["/health"]).toBeUndefined();
		expect(spec.paths["/docs"]).toBeUndefined();
	});

	it("GET /openapi.json sets servers[0].url from SERVER_BASE_URL + SERVER_PUBLIC_PATH_PREFIX", async () => {
		const res = await app.inject({ method: "GET", url: "/openapi.json" });
		const spec = res.json() as { servers: Array<{ url: string }> };
		expect(spec.servers[0].url).toBe("https://api.example.com/api/video_editor/server");
	});

	it("GET /docs serves Swagger UI HTML", async () => {
		const res = await app.inject({ method: "GET", url: "/docs/" });
		expect(res.statusCode).toBe(200);
		expect(res.headers["content-type"]).toContain("text/html");
	});
});
