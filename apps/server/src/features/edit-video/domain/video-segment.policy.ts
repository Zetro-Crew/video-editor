import type { TimeRange } from "@video-editor/contract/internal/shared";
import { probeMpdMetadata } from "../../../infrastructure/ffmpeg/ffmpeg.utils.ts";
import { ONE_HOUR_IN_SECONDS } from "../../../shared/utils/time.utils.ts";

const MAX_MPD_VIDEO_WIDTH = 1920;
const MAX_MPD_VIDEO_HEIGHT = 1080;

const isMpdLongerThanOneHour = (durationInSeconds: number): boolean => {
	return durationInSeconds > ONE_HOUR_IN_SECONDS;
};

const isMpdResolutionTooLarge = (width: number, height: number): boolean => {
	return width > MAX_MPD_VIDEO_WIDTH || height > MAX_MPD_VIDEO_HEIGHT;
};

export const validateMpdRestrictions = async (url: string): Promise<void> => {
	try {
		const metadata = await probeMpdMetadata(url);

		if (
			isMpdLongerThanOneHour(metadata.duration) ||
			isMpdResolutionTooLarge(metadata.width, metadata.height)
		) {
			throw new Error(
				`MPD stream duration (${Math.round(metadata.duration)}s) or resolution (${metadata.width}x${metadata.height}) exceeds maximum allowed (${ONE_HOUR_IN_SECONDS}s, ${MAX_MPD_VIDEO_WIDTH}x${MAX_MPD_VIDEO_HEIGHT})`,
			);
		}
	} catch (err) {
		throw new Error(
			`MPD validation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
		);
	}
};

const isValidSegment = (segment: TimeRange): boolean => segment.end > segment.start;

export const calculateTotalDurationSegments = (segments: TimeRange[]): number =>
	segments.reduce((acc, segment) => acc + (segment.end - segment.start), 0);

const clipToBoundary = (segment: TimeRange, min: number, max: number): TimeRange => ({
	start: Math.max(segment.start, min),
	end: Math.min(segment.end, max),
});

const createGapSegment = (gapStart: number, cut: TimeRange, trimEnd: number): TimeRange => ({
	start: gapStart,
	end: Math.min(cut.start, trimEnd),
});

const TRIM_START = 0;

const findGapsBetweenCuts = (cuts: TimeRange[], trimEnd: number): TimeRange[] => {
	const { segments } = cuts.reduce(
		(acc: { segments: TimeRange[]; currentStart: number }, cut: TimeRange) => {
			if (cut.start > acc.currentStart) {
				acc.segments.push(createGapSegment(acc.currentStart, cut, trimEnd));
			}
			acc.currentStart = Math.max(acc.currentStart, cut.end);

			return acc;
		},
		{ segments: [] as TimeRange[], currentStart: TRIM_START },
	);

	return segments;
};

const createFinalSegment = (cuts: TimeRange[], trimEnd: number): TimeRange | null => {
	const lastEnd = cuts.length > 0 ? Math.max(TRIM_START, ...cuts.map((c) => c.end)) : TRIM_START;

	return lastEnd < trimEnd ? { start: lastEnd, end: trimEnd } : null;
};

export const calculateKeepSegments = ({
	trimEnd,
	cuts,
}: {
	trimEnd: number;
	cuts: { start: number; end: number }[];
}): TimeRange[] => {
	const sortedCuts = [...cuts].sort((a: TimeRange, b: TimeRange) => a.start - b.start);
	const gapSegments = findGapsBetweenCuts(sortedCuts, trimEnd);
	const finalSegment = createFinalSegment(sortedCuts, trimEnd);
	const segmentsToKeep = [...gapSegments, ...(finalSegment ? [finalSegment] : [])]
		.map((seg: TimeRange) => clipToBoundary(seg, TRIM_START, trimEnd))
		.filter((seg: TimeRange) => isValidSegment(seg));

	return segmentsToKeep;
};
