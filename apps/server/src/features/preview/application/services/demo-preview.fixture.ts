import { readFileSync } from "node:fs";
import path from "node:path";

export const DEMO_PREVIEW_CHANNEL_ID = "demo-recording";
const DEMO_PREVIEW_SEGMENT_START_MS = 1778412270000;
const DEMO_PREVIEW_TOTAL_DURATION_MS = 30000;

const demoAssetsDir = path.join(import.meta.dirname, "__fixtures__/hls-preview/demo-dash");

export const getDemoPreviewAssetsDir = (): string => demoAssetsDir;

export const loadDemoPreviewFixture = (
	serverBaseUrl: string,
): {
	mpdXml: string;
	baseUrl: string;
	segmentStartTimeMs: number;
	endTimeMs: number;
} => ({
	mpdXml: readFileSync(path.join(demoAssetsDir, "stream.mpd"), "utf-8"),
	baseUrl: `${serverBaseUrl}/editor/demo-assets`,
	segmentStartTimeMs: DEMO_PREVIEW_SEGMENT_START_MS,
	endTimeMs: DEMO_PREVIEW_SEGMENT_START_MS + DEMO_PREVIEW_TOTAL_DURATION_MS,
});
