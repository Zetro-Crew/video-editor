import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXCHANGE_NAME } from "../envelope.js";
import {
	EXPORT_COMPLETED,
	EXPORT_COMPLETED_V1,
	EXPORT_FAILED,
	EXPORT_FAILED_V1,
	EXPORT_STARTED,
	EXPORT_STARTED_V1,
	exportCompletedEnvelopeSchema,
	exportFailedEnvelopeSchema,
	exportStartedEnvelopeSchema,
} from "../export.js";
import {
	mockExportCompletedEnvelope,
	mockExportFailedEnvelope,
	mockExportStartedEnvelope,
} from "../mocks.js";

describe("event routing keys", () => {
	it("uses lowercase domain.action pattern", () => {
		assert.equal(EXPORT_STARTED, "export.started");
		assert.equal(EXPORT_COMPLETED, "export.completed");
		assert.equal(EXPORT_FAILED, "export.failed");
	});

	it("starts at version 1", () => {
		assert.equal(EXPORT_STARTED_V1, 1);
		assert.equal(EXPORT_COMPLETED_V1, 1);
		assert.equal(EXPORT_FAILED_V1, 1);
	});
});

describe("exportStartedEnvelopeSchema", () => {
	it("accepts the v1 mock envelope", () => {
		assert.equal(exportStartedEnvelopeSchema.safeParse(mockExportStartedEnvelope).success, true);
	});

	it("rejects an envelope missing eventVersion", () => {
		const { eventVersion: _v, ...rest } = mockExportStartedEnvelope;
		assert.equal(exportStartedEnvelopeSchema.safeParse(rest).success, false);
	});

	it("rejects envelope with non-positive eventVersion", () => {
		assert.equal(
			exportStartedEnvelopeSchema.safeParse({ ...mockExportStartedEnvelope, eventVersion: 0 })
				.success,
			false,
		);
	});

	it("rejects envelope whose data is missing jobId", () => {
		const { jobId: _j, ...restData } = mockExportStartedEnvelope.data;
		assert.equal(
			exportStartedEnvelopeSchema.safeParse({ ...mockExportStartedEnvelope, data: restData })
				.success,
			false,
		);
	});
});

describe("exportCompletedEnvelopeSchema", () => {
	it("accepts the v1 mock envelope", () => {
		assert.equal(
			exportCompletedEnvelopeSchema.safeParse(mockExportCompletedEnvelope).success,
			true,
		);
	});

	it("rejects non-http url", () => {
		assert.equal(
			exportCompletedEnvelopeSchema.safeParse({
				...mockExportCompletedEnvelope,
				data: { ...mockExportCompletedEnvelope.data, url: "ftp://x/y.mp4" },
			}).success,
			false,
		);
	});
});

describe("exportFailedEnvelopeSchema", () => {
	it("accepts the v1 mock envelope", () => {
		assert.equal(exportFailedEnvelopeSchema.safeParse(mockExportFailedEnvelope).success, true);
	});

	it("rejects empty error string", () => {
		assert.equal(
			exportFailedEnvelopeSchema.safeParse({
				...mockExportFailedEnvelope,
				data: { ...mockExportFailedEnvelope.data, error: "" },
			}).success,
			false,
		);
	});
});

describe("envelope strictness", () => {
	it("rejects extra top-level fields", () => {
		assert.equal(
			exportStartedEnvelopeSchema.safeParse({
				...mockExportStartedEnvelope,
				extraneous: "no",
			}).success,
			false,
		);
	});
});

describe("EXCHANGE_NAME", () => {
	it("is the public 'video-editor' topic exchange name", () => {
		assert.equal(EXCHANGE_NAME, "video-editor");
	});
});
