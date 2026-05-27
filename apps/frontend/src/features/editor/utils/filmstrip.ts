import type { FilmstripBacklogOptions } from "../timeline/types";

export const calculateThumbnailSegmentLayout = (
	thumbnailWidth: number,
): FilmstripBacklogOptions => {
	// Calculate the maximum number of thumbnails based on the thumbnail width
	const maxThumbnails = Math.floor(1200 / thumbnailWidth);

	// Calculate the total width required for the thumbnails
	const segmentSize = maxThumbnails * thumbnailWidth;

	return {
		thumbnailsPerSegment: maxThumbnails,
		segmentSize,
	};
};

//  it calculates the number of segments that are offscreen
export const calculateOffscreenSegments = (
	offscreenWidth: number,
	trimFromSize: number,
	segmentSize: number,
) => {
	const offscreenSegments = Math.floor((offscreenWidth + trimFromSize) / segmentSize);
	return offscreenSegments;
};
