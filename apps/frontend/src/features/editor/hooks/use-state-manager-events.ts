import type StateManager from "@designcombo/state";
import type { IAudio, ITrackItem, IVideo } from "@designcombo/types";
import { useEffect } from "react";
import { audioDataManager } from "../player/lib/audio-data";
import type { ICompositionStore } from "../store/use-composition-store";
import useCompositionStore from "../store/use-composition-store";
import type { ITimelineViewStore } from "../store/use-timeline-view-store";
import useTimelineViewStore from "../store/use-timeline-view-store";

const COMPOSITION_KEYS = [
	"tracks",
	"trackItemIds",
	"trackItemsMap",
	"duration",
	"fps",
	"background",
	"size",
	"structure",
	"compositions",
] as const satisfies ReadonlyArray<keyof ICompositionStore>;

const TIMELINE_VIEW_KEYS = ["scale", "scroll"] as const satisfies ReadonlyArray<
	keyof ITimelineViewStore
>;

type CompositionPatch = Partial<Pick<ICompositionStore, (typeof COMPOSITION_KEYS)[number]>>;

type TimelineViewPatch = Partial<Pick<ITimelineViewStore, (typeof TIMELINE_VIEW_KEYS)[number]>>;

const COMPOSITION_FIELDS: ReadonlySet<string> = new Set(COMPOSITION_KEYS);
const TIMELINE_VIEW_FIELDS: ReadonlySet<string> = new Set(TIMELINE_VIEW_KEYS);

const routeStateUpdate = (newState: Record<string, unknown>) => {
	const composition: Record<string, unknown> = {};
	const timelineView: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(newState)) {
		if (COMPOSITION_FIELDS.has(key)) composition[key] = value;
		else if (TIMELINE_VIEW_FIELDS.has(key)) timelineView[key] = value;
	}

	if (Object.keys(composition).length)
		useCompositionStore.setState(composition as CompositionPatch);
	if (Object.keys(timelineView).length)
		useTimelineViewStore.setState(timelineView as TimelineViewPatch);
};

export const useStateManagerEvents = (stateManager: StateManager) => {
	useEffect(() => {
		const handleTrackItemUpdate = () => {
			const currentState = stateManager.getState();
			const filterTrackItems = Object.values(currentState.trackItemsMap).filter(
				(item) => item.type === "video" || item.type === "audio",
			) as (ITrackItem & (IVideo | IAudio))[];

			audioDataManager.setItems(filterTrackItems);
			audioDataManager.validateUpdateItems(filterTrackItems);
			useCompositionStore.setState({
				duration: currentState.duration,
				trackItemsMap: currentState.trackItemsMap,
			});
		};

		const handleAddRemoveItems = () => {
			const currentState = stateManager.getState();
			const filterTrackItems = Object.values(currentState.trackItemsMap).filter(
				(item) => item.type === "video" || item.type === "audio",
			) as (ITrackItem & (IVideo | IAudio))[];

			audioDataManager.validateUpdateItems(filterTrackItems);
			useCompositionStore.setState({
				trackItemsMap: currentState.trackItemsMap,
				trackItemIds: currentState.trackItemIds,
				tracks: currentState.tracks,
			});
		};

		const handleUpdateItemDetails = () => {
			const currentState = stateManager.getState();
			useCompositionStore.setState({
				trackItemsMap: currentState.trackItemsMap,
			});
		};

		const subs = [
			stateManager.subscribeToUpdateStateDetails((newState) =>
				routeStateUpdate(newState as Record<string, unknown>),
			),
			stateManager.subscribeToScale((newState) =>
				routeStateUpdate(newState as Record<string, unknown>),
			),
			stateManager.subscribeToState((newState) =>
				routeStateUpdate(newState as Record<string, unknown>),
			),
			stateManager.subscribeToDuration((newState) =>
				routeStateUpdate(newState as Record<string, unknown>),
			),
			stateManager.subscribeToUpdateTrackItem(handleTrackItemUpdate),
			stateManager.subscribeToAddOrRemoveItems(handleAddRemoveItems),
			stateManager.subscribeToUpdateItemDetails(handleUpdateItemDetails),
		];

		return () => {
			for (const sub of subs) sub.unsubscribe();
		};
	}, [stateManager]);
};
