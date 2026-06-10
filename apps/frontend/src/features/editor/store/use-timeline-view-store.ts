import type { ITimelineScaleState, ITimelineScrollState } from "@designcombo/types";
import { create } from "zustand";

export interface ITimelineViewStore {
	scale: ITimelineScaleState;
	scroll: ITimelineScrollState;
	showVideoTracks: boolean;
	showAudioTracks: boolean;
	playbackRate: number;
	setScale: (scale: ITimelineScaleState) => void;
	setScroll: (scroll: ITimelineScrollState) => void;
	setShowVideoTracks: (v: boolean) => void;
	setShowAudioTracks: (v: boolean) => void;
	setPlaybackRate: (v: number) => void;
}

const useTimelineViewStore = create<ITimelineViewStore>((set) => ({
	scale: {
		// 1x distance (second 0 to second 5, 5 segments).
		index: 7,
		unit: 300,
		zoom: 1 / 300,
		segments: 5,
	},
	scroll: {
		left: 0,
		top: 0,
	},
	showVideoTracks: true,
	showAudioTracks: true,
	playbackRate: 1,
	setScale: (scale) => set({ scale }),
	setScroll: (scroll) => set({ scroll }),
	setShowVideoTracks: (v) => set({ showVideoTracks: v }),
	setShowAudioTracks: (v) => set({ showAudioTracks: v }),
	setPlaybackRate: (v) => set({ playbackRate: v }),
}));

export default useTimelineViewStore;
