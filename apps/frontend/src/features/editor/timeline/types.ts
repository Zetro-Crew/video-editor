export interface Filmstrip {
	segmentIndex?: number;
	offset: number;
	thumbnailsCount: number;
	startTime: number;
	widthOnScreen: number;
}

export interface FilmstripBacklogOptions {
	thumbnailsPerSegment: number; // Number of thumbnails preloaded for smooth scrolling
	segmentSize: number; // Total width required to display thumbnails side by side
}
