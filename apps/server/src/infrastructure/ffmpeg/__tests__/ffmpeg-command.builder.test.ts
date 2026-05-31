import { describe, expect, it } from "vitest";
import type { EnvConfig } from "../../../config/env.ts";
import { FfmpegCommandBuilder } from "../ffmpeg-command.builder.ts";

const config = {
	FFMPEG_PRESET: "veryfast",
	FFMPEG_CRF: "20",
	FFMPEG_AUDIO_BITRATE: "192k",
} as unknown as EnvConfig;

const buildMp4Args = (needsProcessing: boolean, withWatermark = false): string[] => {
	const builder = new FfmpegCommandBuilder(config);
	builder.addVideoSegments("/tmp/concat.txt");
	if (withWatermark) {
		builder.addWatermarkInput("/tmp/watermark.png");
	}
	const { videoStream, audioStreams } = builder.buildFilters(
		[],
		[],
		10,
		false,
		[],
		false,
		"mix",
		false,
	);
	return builder.buildParameters(videoStream, audioStreams, needsProcessing, [], "mp4", false);
};

describe("FfmpegCommandBuilder — mp4 pipe output movflags", () => {
	it("transcoding mp4 args do not contain +faststart (pipe:1 cannot seek)", () => {
		const args = buildMp4Args(true);
		expect(args.join(" ")).not.toContain("+faststart");
	});

	it("transcoding mp4 args include pipe-safe fragmented MP4 flags", () => {
		const args = buildMp4Args(true);
		const joined = args.join(" ");
		expect(joined).toContain("+frag_keyframe");
		expect(joined).toContain("+empty_moov");
		expect(joined).toContain("+default_base_moof");
	});

	it("stream copy mp4 args also omit +faststart", () => {
		const args = buildMp4Args(false);
		expect(args.join(" ")).not.toContain("+faststart");
	});

	it("stream copy mp4 args include pipe-safe fragmented MP4 flags", () => {
		const args = buildMp4Args(false);
		const joined = args.join(" ");
		expect(joined).toContain("+frag_keyframe");
		expect(joined).toContain("+empty_moov");
		expect(joined).toContain("+default_base_moof");
	});

	it("non-mp4 formats do not get movflags injected", () => {
		const builder = new FfmpegCommandBuilder(config);
		builder.addVideoSegments("/tmp/concat.txt");
		const { videoStream, audioStreams } = builder.buildFilters(
			[],
			[],
			10,
			false,
			[],
			false,
			"mix",
			false,
		);
		const args = builder.buildParameters(videoStream, audioStreams, true, [], "webm", false);
		expect(args.join(" ")).not.toContain("-movflags");
	});
});
