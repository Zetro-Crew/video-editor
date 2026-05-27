// types.ts

export interface Animation {
	property: string;
	from: number;
	to: number;
	durationInFrames: number;
	ease: (t: number) => number;
	delay?: number;
	previewUrl?: string;
	name?: string;
	details?: {
		fonts?: {
			fontFamily: string;
			url: string;
		}[];
	};
}
