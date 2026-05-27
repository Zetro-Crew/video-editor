import type { ITrackItem } from "@designcombo/types";
import useCompositionStore from "../store/use-composition-store";
import useSelectionStore from "../store/use-selection-store";

const useActiveItem = (): ITrackItem | null => {
	const activeIds = useSelectionStore((s) => s.activeIds);
	const trackItemsMap = useCompositionStore((s) => s.trackItemsMap);
	if (activeIds.length !== 1) return null;
	return trackItemsMap[activeIds[0]] ?? null;
};

export default useActiveItem;
