import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { silentLogger } from "../../../../../../infrastructure/fastify/__tests__/silent-logger.ts";
import {
	createFastifyInstance,
	type TypedFastify,
} from "../../../../../../infrastructure/fastify/fastify.ts";
import { PublishExhaustedError } from "../../../../../../infrastructure/messaging/RabbitMQPublisher.ts";
import type { RenderCommandPort } from "../../../../application/ports/outbound/RenderCommandPort.ts";
import { renderController } from "../render.controller.ts";

const validDesign = {
	id: "test-id",
	size: { width: 1920, height: 1080 },
	fps: 30,
	tracks: [],
	trackItemIds: [],
	trackItemsMap: {},
};

const validSaveMetadata = {
	mediaId: "550e8400-e29b-41d4-a716-446655440000",
	mediaName: "clip",
	downloadToComputer: true,
	saveToPersonalChannel: false,
	selectedUnitChannelIds: ["ch1"],
	items: [],
};

function makeCommandPortSpy(): RenderCommandPort & {
	enqueueRender: ReturnType<typeof vi.fn>;
} {
	return {
		enqueueRender: vi.fn().mockResolvedValue(undefined),
	};
}

describe("renderController", () => {
	let app: TypedFastify;
	let renderCommandPort: ReturnType<typeof makeCommandPortSpy>;

	beforeEach(async () => {
		app = createFastifyInstance({ loggerInstance: silentLogger });
		renderCommandPort = makeCommandPortSpy();
		await app.register(renderController, { renderCommandPort });
		await app.ready();
	});

	afterEach(async () => {
		await app.close();
	});

	it("POST /render returns 202 with job id", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/render",
			payload: { design: validDesign, options: { format: "mp4" } },
		});
		expect(res.statusCode).toBe(202);
		expect((res.json() as { id: string }).id).toBeTruthy();
	});

	it("POST /render publishes RenderRequested command with jobId + exportType", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/render",
			payload: { design: validDesign, options: { format: "mp4" } },
		});
		const { id } = res.json() as { id: string };
		expect(renderCommandPort.enqueueRender).toHaveBeenCalledWith(
			expect.objectContaining({ jobId: id, exportType: "mp4", format: "mp4" }),
		);
	});

	it("POST /render with saveMetadata forwards saveMetadata to command", async () => {
		await app.inject({
			method: "POST",
			url: "/render",
			payload: {
				design: validDesign,
				options: { format: "mp4" },
				saveMetadata: validSaveMetadata,
			},
		});
		expect(renderCommandPort.enqueueRender).toHaveBeenCalledWith(
			expect.objectContaining({
				saveMetadata: expect.objectContaining({ mediaName: "clip" }),
				exportType: "mp4",
			}),
		);
	});

	it("POST /render without saveMetadata omits saveMetadata from command", async () => {
		await app.inject({
			method: "POST",
			url: "/render",
			payload: { design: validDesign, options: { format: "mp4" } },
		});
		const call = renderCommandPort.enqueueRender.mock.calls[0]?.[0] as {
			saveMetadata?: unknown;
		};
		expect(call.saveMetadata).toBeUndefined();
	});

	it("exportType is webp when format is webp", async () => {
		await app.inject({
			method: "POST",
			url: "/render",
			payload: { design: validDesign, options: { format: "webp" } },
		});
		expect(renderCommandPort.enqueueRender).toHaveBeenCalledWith(
			expect.objectContaining({ exportType: "webp", format: "webp" }),
		);
	});

	it("POST /render with invalid design returns 400 referencing design path", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/render",
			payload: { design: { fps: -1 } },
		});
		expect(res.statusCode).toBe(400);
		const body = res.json() as { error: string };
		expect(body.error).toContain("design");
		expect(renderCommandPort.enqueueRender).not.toHaveBeenCalled();
	});

	it("POST /render with invalid saveMetadata returns 400", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/render",
			payload: {
				design: validDesign,
				options: { format: "mp4" },
				saveMetadata: { mediaId: "" },
			},
		});
		expect(res.statusCode).toBe(400);
		expect(renderCommandPort.enqueueRender).not.toHaveBeenCalled();
	});

	it("POST /render returns 503 with only { error } body when enqueueRender throws PublishExhaustedError", async () => {
		renderCommandPort.enqueueRender.mockRejectedValueOnce(
			new PublishExhaustedError("render.requested", 3, new Error("broker down")),
		);
		const res = await app.inject({
			method: "POST",
			url: "/render",
			payload: { design: validDesign, options: { format: "mp4" } },
		});
		expect(res.statusCode).toBe(503);
		const body = res.json() as Record<string, unknown>;
		expect(Object.keys(body)).toEqual(["error"]);
		expect(body.error).toBe("render queue unavailable");
	});

	it("POST /render forwards full SavedMediaPayload to command saveMetadata", async () => {
		const items = [
			{ type: "image" as const, id: "img-1" },
			{ type: "clip" as const, id: "media-1" },
		];
		await app.inject({
			method: "POST",
			url: "/render",
			payload: {
				design: validDesign,
				options: { format: "mp4" },
				saveMetadata: { ...validSaveMetadata, items },
			},
		});
		expect(renderCommandPort.enqueueRender).toHaveBeenCalledWith(
			expect.objectContaining({
				saveMetadata: expect.objectContaining({
					mediaId: validSaveMetadata.mediaId,
					mediaName: validSaveMetadata.mediaName,
					items,
				}),
			}),
		);
	});
});
