import type { ConsumeMessage } from "amqplib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNoopMonitorFactory } from "../../../../../../infrastructure/messaging/createNoopMonitorFactory.ts";
import type { ExportEventPublisherPort } from "../../../../../../infrastructure/messaging/RabbitMQPublisher.ts";
import {
	RENDER_REQUESTED,
	RENDER_REQUESTED_V1,
	type RenderRequestedData,
} from "../../../../../../infrastructure/messaging/schemas/commands.ts";
import type { StoragePort } from "../../../../../../shared/application/ports/outbound/StoragePort.ts";
import type { VideoRenderUseCase } from "../../../../application/use-cases/VideoRenderUseCase.ts";
import { type AckChannel, RenderRequestedConsumer } from "../RenderRequestedConsumer.ts";

type Spies = {
	storage: StoragePort & {
		exists: ReturnType<typeof vi.fn>;
		getPresignedUrl: ReturnType<typeof vi.fn>;
	};
	useCase: { execute: ReturnType<typeof vi.fn> };
	publisher: ExportEventPublisherPort & {
		publishExportStarted: ReturnType<typeof vi.fn>;
		publishExportCompleted: ReturnType<typeof vi.fn>;
		publishExportFailed: ReturnType<typeof vi.fn>;
	};
	channel: AckChannel & {
		ack: ReturnType<typeof vi.fn>;
		nack: ReturnType<typeof vi.fn>;
	};
};

function makeSpies(): Spies {
	return {
		storage: {
			exists: vi.fn().mockResolvedValue(false),
			getPresignedUrl: vi.fn().mockResolvedValue("https://s3.example.com/cached.mp4"),
			uploadStream: vi.fn(),
			downloadToFile: vi.fn(),
			getPresignedUploadUrl: vi.fn(),
			deleteFile: vi.fn(),
			ensureBucketExists: vi.fn(),
		},
		useCase: {
			execute: vi.fn().mockResolvedValue({
				s3Key: "output/job-1.mp4",
				url: "https://s3.example.com/out.mp4",
				segments: [],
			}),
		},
		publisher: {
			publishExportStarted: vi.fn().mockResolvedValue(undefined),
			publishExportCompleted: vi.fn().mockResolvedValue(undefined),
			publishExportFailed: vi.fn().mockResolvedValue(undefined),
		},
		channel: {
			ack: vi.fn(),
			nack: vi.fn(),
		},
	};
}

function makeRenderData(overrides: Partial<RenderRequestedData> = {}): RenderRequestedData {
	return {
		jobId: "job-1",
		sources: [],
		trimEnd: 0,
		cuts: [],
		overlays: [],
		audioSources: [],
		audioMixMode: "mix",
		format: "mp4",
		exportType: "mp4",
		...overrides,
	};
}

function makeEnvelopeMsg(data: RenderRequestedData): ConsumeMessage {
	const envelope = {
		eventName: RENDER_REQUESTED,
		eventVersion: RENDER_REQUESTED_V1,
		occurredAt: new Date().toISOString(),
		data,
	};
	return {
		content: Buffer.from(JSON.stringify(envelope)),
		fields: {} as ConsumeMessage["fields"],
		properties: {} as ConsumeMessage["properties"],
	} as ConsumeMessage;
}

function makeRawMsg(raw: string): ConsumeMessage {
	return {
		content: Buffer.from(raw),
		fields: {} as ConsumeMessage["fields"],
		properties: {} as ConsumeMessage["properties"],
	} as ConsumeMessage;
}

function buildConsumer(spies: Spies): RenderRequestedConsumer {
	return new RenderRequestedConsumer({
		storage: spies.storage,
		videoRenderUseCase: spies.useCase as unknown as VideoRenderUseCase,
		exportPublisher: spies.publisher,
		monitorFactory: createNoopMonitorFactory(),
		s3OutputPrefix: "output",
		renderUrlExpirySeconds: 3600,
	});
}

describe("RenderRequestedConsumer", () => {
	let spies: Spies;

	beforeEach(() => {
		spies = makeSpies();
	});

	it("happy path: started → execute → completed → ack (in order)", async () => {
		const data = makeRenderData({
			saveMetadata: {
				mediaId: "550e8400-e29b-41d4-a716-446655440000",
				mediaName: "clip",
				downloadToComputer: true,
				saveToPersonalChannel: false,
				selectedUnitChannelIds: ["ch1"],
				items: [],
			},
		});
		const msg = makeEnvelopeMsg(data);
		const order: string[] = [];
		spies.publisher.publishExportStarted.mockImplementation(async () => {
			order.push("started");
		});
		spies.useCase.execute.mockImplementation(async () => {
			order.push("execute");
			return { s3Key: "output/job-1.mp4", url: "https://s3.example.com/out.mp4", segments: [] };
		});
		spies.publisher.publishExportCompleted.mockImplementation(async () => {
			order.push("completed");
		});
		spies.channel.ack.mockImplementation(() => {
			order.push("ack");
		});

		await buildConsumer(spies).handle(msg, spies.channel);

		expect(order).toEqual(["started", "execute", "completed", "ack"]);
		expect(spies.useCase.execute).toHaveBeenCalledWith(
			expect.objectContaining({ format: "mp4" }),
			"output/job-1.mp4",
		);
		expect(spies.publisher.publishExportCompleted).toHaveBeenCalledWith(
			expect.objectContaining({ jobId: "job-1", url: "https://s3.example.com/out.mp4" }),
		);
		expect(spies.channel.nack).not.toHaveBeenCalled();
	});

	it("does not publish started when saveMetadata is absent", async () => {
		const msg = makeEnvelopeMsg(makeRenderData());
		await buildConsumer(spies).handle(msg, spies.channel);
		expect(spies.publisher.publishExportStarted).not.toHaveBeenCalled();
		expect(spies.publisher.publishExportCompleted).toHaveBeenCalledOnce();
		expect(spies.channel.ack).toHaveBeenCalledOnce();
	});

	it("idempotency short-circuit: exists()=true → completed + ack; no started, no execute", async () => {
		spies.storage.exists.mockResolvedValueOnce(true);
		const data = makeRenderData({
			saveMetadata: {
				mediaId: "550e8400-e29b-41d4-a716-446655440000",
				mediaName: "clip",
				downloadToComputer: true,
				saveToPersonalChannel: false,
				selectedUnitChannelIds: [],
				items: [],
			},
		});
		const msg = makeEnvelopeMsg(data);

		await buildConsumer(spies).handle(msg, spies.channel);

		expect(spies.useCase.execute).not.toHaveBeenCalled();
		expect(spies.publisher.publishExportStarted).not.toHaveBeenCalled();
		expect(spies.publisher.publishExportCompleted).toHaveBeenCalledWith(
			expect.objectContaining({
				jobId: "job-1",
				url: "https://s3.example.com/cached.mp4",
				exportType: "mp4",
			}),
		);
		expect(spies.storage.getPresignedUrl).toHaveBeenCalledWith("output/job-1.mp4", 3600);
		expect(spies.channel.ack).toHaveBeenCalledOnce();
		expect(spies.channel.nack).not.toHaveBeenCalled();
	});

	it("transient failure: use case throws → nack(false, true); no completed", async () => {
		spies.useCase.execute.mockRejectedValueOnce(new Error("ffmpeg crashed"));
		const msg = makeEnvelopeMsg(makeRenderData());

		await buildConsumer(spies).handle(msg, spies.channel);

		expect(spies.channel.nack).toHaveBeenCalledWith(msg, false, true);
		expect(spies.channel.ack).not.toHaveBeenCalled();
		expect(spies.publisher.publishExportCompleted).not.toHaveBeenCalled();
	});

	it("poison envelope (malformed JSON) with recoverable jobId → export.failed + ack", async () => {
		const raw = '{"data":{"jobId":"poison-1"},broken';
		const msg = makeRawMsg(raw);

		await buildConsumer(spies).handle(msg, spies.channel);

		expect(spies.publisher.publishExportFailed).toHaveBeenCalledWith(
			expect.objectContaining({ jobId: "poison-1", error: "invalid envelope" }),
		);
		expect(spies.channel.ack).toHaveBeenCalledOnce();
		expect(spies.useCase.execute).not.toHaveBeenCalled();
		expect(spies.channel.nack).not.toHaveBeenCalled();
	});

	it("poison envelope (malformed JSON) with no jobId → ack + no publish", async () => {
		const msg = makeRawMsg("{not-json");
		await buildConsumer(spies).handle(msg, spies.channel);
		expect(spies.publisher.publishExportFailed).not.toHaveBeenCalled();
		expect(spies.channel.ack).toHaveBeenCalledOnce();
	});

	it("schema-invalid envelope with jobId in raw → export.failed + ack", async () => {
		const envelope = {
			eventName: RENDER_REQUESTED,
			eventVersion: RENDER_REQUESTED_V1,
			occurredAt: new Date().toISOString(),
			data: { jobId: "schema-1" }, // missing required fields
		};
		const msg = makeRawMsg(JSON.stringify(envelope));

		await buildConsumer(spies).handle(msg, spies.channel);

		expect(spies.publisher.publishExportFailed).toHaveBeenCalledWith(
			expect.objectContaining({ jobId: "schema-1", error: "invalid envelope" }),
		);
		expect(spies.channel.ack).toHaveBeenCalledOnce();
	});
});
