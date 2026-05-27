import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { StoragePort } from "../../../../shared/application/ports/outbound/StoragePort.ts";

export interface PreviewJob {
	jobId: string;
	playlistUrl: string;
}

export const storePreviewPlaylist = async (
	playlist: string,
	s3Prefix: string,
	storage: StoragePort,
	expiresInSeconds: number,
): Promise<PreviewJob> => {
	const jobId = randomUUID();
	const s3Key = `${s3Prefix}/${jobId}/index.m3u8`;

	const stream = Readable.from([playlist]);
	await storage.uploadStream(stream, s3Key, "application/vnd.apple.mpegurl");

	const playlistUrl = await storage.getPresignedUrl(s3Key, expiresInSeconds);

	return { jobId, playlistUrl };
};
