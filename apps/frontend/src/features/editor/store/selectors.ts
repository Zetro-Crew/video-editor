import type { ITrackItem } from "@designcombo/types";
import useCompositionStore, { type ICompositionStore } from "./use-composition-store";

export const selectActiveItem = (state: ICompositionStore): ITrackItem | null => {
	if (state.activeIds.length !== 1) return null;
	return state.trackItemsMap[state.activeIds[0]] ?? null;
};

export const useActiveItem = (): ITrackItem | null => useCompositionStore(selectActiveItem);

export const useHasSelection = (): boolean => useCompositionStore((s) => s.activeIds.length > 0);
