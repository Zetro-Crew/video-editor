import { describe, expect, it } from "vitest";
import { NullExportEventPublisher } from "../NullExportEventPublisher.ts";

describe("NullExportEventPublisher", () => {
	const publisher = new NullExportEventPublisher();

	it("publishExportStarted resolves without error", async () => {
		await expect(
			publisher.publishExportStarted({
				jobId: "j1",
				mediaId: "m1",
				mediaName: "test",
				downloadToComputer: false,
				saveToPersonalChannel: false,
				selectedUnitChannelIds: [],
				exportType: "mp4",
				items: [],
			}),
		).resolves.toBeUndefined();
	});

	it("publishExportCompleted resolves without error", async () => {
		await expect(
			publisher.publishExportCompleted({
				jobId: "j1",
				url: "https://example.com/out.mp4",
				exportType: "mp4",
			}),
		).resolves.toBeUndefined();
	});

	it("publishExportFailed resolves without error", async () => {
		await expect(
			publisher.publishExportFailed({ jobId: "j1", error: "render blew up" }),
		).resolves.toBeUndefined();
	});
});
