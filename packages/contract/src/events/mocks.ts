import type {
	ExportCompletedEnvelope,
	ExportFailedEnvelope,
	ExportStartedEnvelope,
} from "./export.js";

export const mockExportStartedEnvelope: ExportStartedEnvelope = {
	eventName: "export.started",
	eventVersion: 1,
	occurredAt: "2026-05-31T12:00:00.000Z",
	data: {
		jobId: "job-1",
		mediaId: "550e8400-e29b-41d4-a716-446655440000",
		mediaName: "Demo Export",
		downloadToComputer: true,
		saveToPersonalChannel: false,
		selectedUnitChannelIds: [],
		exportType: "mp4",
		items: [{ type: "clip", id: "media-1" }],
	},
};

export const mockExportCompletedEnvelope: ExportCompletedEnvelope = {
	eventName: "export.completed",
	eventVersion: 1,
	occurredAt: "2026-05-31T12:00:30.000Z",
	data: {
		jobId: "job-1",
		url: "https://example.com/output/job-1.mp4",
		exportType: "mp4",
	},
};

export const mockExportFailedEnvelope: ExportFailedEnvelope = {
	eventName: "export.failed",
	eventVersion: 1,
	occurredAt: "2026-05-31T12:00:30.000Z",
	data: {
		jobId: "job-1",
		error: "ffmpeg exited with code 1",
	},
};
