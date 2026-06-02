import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportEventPublisherPort } from "../../../../../../infrastructure/messaging/RabbitMQPublisher.ts";
import type {
	RenderJobState,
	RenderJobStatePort,
} from "../../../../application/ports/outbound/RenderJobStatePort.ts";
import type { VideoRenderUseCase } from "../../../../application/use-cases/VideoRenderUseCase.ts";
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

function makePublisherSpy(): ExportEventPublisherPort & {
	publishExportStarted: ReturnType<typeof vi.fn>;
	publishExportCompleted: ReturnType<typeof vi.fn>;
	publishExportFailed: ReturnType<typeof vi.fn>;
} {
	return {
		publishExportStarted: vi.fn().mockResolvedValue(undefined),
		publishExportCompleted: vi.fn().mockResolvedValue(undefined),
		publishExportFailed: vi.fn().mockResolvedValue(undefined),
	};
}

function makeJobState(overrides: Partial<RenderJobState> = {}): RenderJobState {
	return { status: "PROCESSING", progress: 0, ...overrides };
}

describe("renderController", () => {
	let app: ReturnType<typeof Fastify>;
	let videoRenderUseCase: { execute: ReturnType<typeof vi.fn> };
	let renderJobStatePort: {
		saveState: ReturnType<typeof vi.fn>;
		getState: ReturnType<typeof vi.fn>;
	};
	let publisher: ReturnType<typeof makePublisherSpy>;

	beforeEach(async () => {
		app = Fastify({ logger: false });
		videoRenderUseCase = {
			execute: vi.fn().mockResolvedValue({
				s3Key: "output/video.mp4",
				url: "https://s3.example.com/out.mp4",
				segments: [],
			}),
		};
		renderJobStatePort = {
			saveState: vi.fn().mockResolvedValue(undefined),
			getState: vi.fn().mockResolvedValue(makeJobState()),
		};
		publisher = makePublisherSpy();
		await app.register(renderController, {
			videoRenderUseCase: videoRenderUseCase as unknown as VideoRenderUseCase,
			renderJobStatePort: renderJobStatePort as unknown as RenderJobStatePort,
			s3OutputPrefix: "output",
			exportEventPublisher: publisher,
		});
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

	it("POST /render with saveMetadata calls publishExportStarted", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/render",
			payload: { design: validDesign, options: { format: "mp4" }, saveMetadata: validSaveMetadata },
		});
		expect(res.statusCode).toBe(202);
		expect(publisher.publishExportStarted).toHaveBeenCalledWith(
			expect.objectContaining({ mediaName: "clip", exportType: "mp4" }),
		);
	});

	it("POST /render without saveMetadata does NOT call publishExportStarted", async () => {
		await app.inject({
			method: "POST",
			url: "/render",
			payload: { design: validDesign, options: { format: "mp4" } },
		});
		expect(publisher.publishExportStarted).not.toHaveBeenCalled();
	});

	it("on render COMPLETED publishExportCompleted called with url", async () => {
		await app.inject({
			method: "POST",
			url: "/render",
			payload: { design: validDesign, options: { format: "mp4" } },
		});
		await vi.waitFor(
			() =>
				expect(publisher.publishExportCompleted).toHaveBeenCalledWith(
					expect.objectContaining({ url: "https://s3.example.com/out.mp4", exportType: "mp4" }),
				),
			{ timeout: 5000 },
		);
	});

	it("on render FAILED publishExportFailed called with error", async () => {
		videoRenderUseCase.execute.mockRejectedValueOnce(new Error("ffmpeg error"));
		await app.inject({
			method: "POST",
			url: "/render",
			payload: { design: validDesign, options: { format: "mp4" } },
		});
		await vi.waitFor(
			() =>
				expect(publisher.publishExportFailed).toHaveBeenCalledWith(
					expect.objectContaining({ error: "ffmpeg error" }),
				),
			{ timeout: 5000 },
		);
	});

	it("exportType is webp when format is webp", async () => {
		await app.inject({
			method: "POST",
			url: "/render",
			payload: {
				design: validDesign,
				options: { format: "webp" },
				saveMetadata: validSaveMetadata,
			},
		});
		expect(publisher.publishExportStarted).toHaveBeenCalledWith(
			expect.objectContaining({ exportType: "webp" }),
		);
		await vi.waitFor(
			() =>
				expect(publisher.publishExportCompleted).toHaveBeenCalledWith(
					expect.objectContaining({ exportType: "webp" }),
				),
			{ timeout: 5000 },
		);
	});

	it("POST /render with invalid design returns 400 with path-prefixed message", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/render",
			payload: { design: { fps: -1 } },
		});
		expect(res.statusCode).toBe(400);
		const body = res.json() as { error: string };
		expect(body.error).toMatch(/^[\w.]+:\s/);
	});

	it("POST /render forwards full SavedMediaPayload to publishExportStarted", async () => {
		const items = [
			{ type: "image" as const, id: "img-1" },
			{ type: "clip" as const, id: "media-1" },
		];
		const res = await app.inject({
			method: "POST",
			url: "/render",
			payload: {
				design: validDesign,
				options: { format: "mp4" },
				saveMetadata: { ...validSaveMetadata, items },
			},
		});
		const { id: jobId } = res.json() as { id: string };
		expect(publisher.publishExportStarted).toHaveBeenCalledWith({
			jobId,
			mediaId: validSaveMetadata.mediaId,
			mediaName: validSaveMetadata.mediaName,
			downloadToComputer: validSaveMetadata.downloadToComputer,
			saveToPersonalChannel: validSaveMetadata.saveToPersonalChannel,
			selectedUnitChannelIds: validSaveMetadata.selectedUnitChannelIds,
			items,
			exportType: "mp4",
		});
	});

	it("on render COMPLETED renderJobStatePort.saveState is called with COMPLETED + 100 + url", async () => {
		await app.inject({
			method: "POST",
			url: "/render",
			payload: { design: validDesign, options: { format: "mp4" } },
		});
		await vi.waitFor(
			() =>
				expect(renderJobStatePort.saveState).toHaveBeenCalledWith(
					expect.any(String),
					expect.objectContaining({
						status: "COMPLETED",
						progress: 100,
						url: "https://s3.example.com/out.mp4",
					}),
				),
			{ timeout: 5000 },
		);
	});

	describe("GET /render", () => {
		it("returns 400 when id is missing", async () => {
			const res = await app.inject({ method: "GET", url: "/render" });
			expect(res.statusCode).toBe(400);
		});

		it("returns 404 when state is null", async () => {
			renderJobStatePort.getState.mockResolvedValueOnce(null);
			const res = await app.inject({ method: "GET", url: "/render?id=missing" });
			expect(res.statusCode).toBe(404);
		});

		it("returns 200 with status/progress/url/presigned_url when state exists", async () => {
			renderJobStatePort.getState.mockResolvedValueOnce(
				makeJobState({ status: "COMPLETED", progress: 100, url: "https://s3.example.com/x.mp4" }),
			);
			const res = await app.inject({ method: "GET", url: "/render?id=abc" });
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual(
				expect.objectContaining({
					status: "COMPLETED",
					progress: 100,
					url: "https://s3.example.com/x.mp4",
					presigned_url: "https://s3.example.com/x.mp4",
				}),
			);
		});
	});
});
