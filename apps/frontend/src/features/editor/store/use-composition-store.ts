import type { IComposition, ISize, ITrack, ITrackItem, ItemStructure } from "@designcombo/types";
import { create } from "zustand";

export interface ICompositionStore {
	tracks: ITrack[];
	trackItemIds: string[];
	trackItemsMap: Record<string, ITrackItem>;
	activeIds: string[];
	duration: number;
	fps: number;
	background: {
		type: "color" | "image";
		value: string;
	};
	size: ISize;
	structure: ItemStructure[];
	compositions: Partial<IComposition>[];
	setSize: (size: ISize) => void;
	setCompositions: (compositions: Partial<IComposition>[]) => void;
	updateTrackItemDetails: (id: string, details: Record<string, unknown>) => void;
}

const useCompositionStore = create<ICompositionStore>((set) => ({
	tracks: [],
	trackItemIds: [],
	trackItemsMap: {},
	activeIds: [],
	duration: 1000,
	fps: 30,
	background: {
		type: "color",
		value: "transparent",
	},
	size: {
		width: 1920,
		height: 1080,
	},
	structure: [],
	compositions: [],
	setSize: (size) => set({ size }),
	setCompositions: (compositions) => set({ compositions }),
	updateTrackItemDetails: (id, details) =>
		set((state) => {
			const item = state.trackItemsMap[id];
			if (!item) return state;
			return {
				trackItemsMap: {
					...state.trackItemsMap,
					[id]: { ...item, details: { ...item.details, ...details } },
				},
			};
		}),
}));

export default useCompositionStore;
