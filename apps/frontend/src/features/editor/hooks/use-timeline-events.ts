import { filter, subject } from "@designcombo/events";
import { LAYER_PREFIX, LAYER_SELECTION } from "@designcombo/state";
import { TIMELINE_PREFIX, TIMELINE_SEEK } from "@designcombo/timeline";
import { useEffect } from "react";
import {
	PLAYER_PAUSE,
	PLAYER_PLAY,
	PLAYER_PREFIX,
	PLAYER_SEEK,
	PLAYER_SEEK_BY,
	PLAYER_TOGGLE_PLAY,
} from "../constants/events";
import useCompositionStore from "../store/use-composition-store";
import useEditorRefs from "../store/use-editor-refs";
import useSelectionStore from "../store/use-selection-store";
import { getSafeCurrentFrame } from "../utils/time";

const useTimelineEvents = () => {
	const playerRef = useEditorRefs((s) => s.playerRef);
	const fps = useCompositionStore((s) => s.fps);

	useEffect(() => {
		const playerEvents = subject.pipe(filter(({ key }) => key.startsWith(PLAYER_PREFIX)));
		const timelineEvents = subject.pipe(filter(({ key }) => key.startsWith(TIMELINE_PREFIX)));

		const timelineEventsSubscription = timelineEvents.subscribe((obj) => {
			if (obj.key === TIMELINE_SEEK) {
				const time = obj.value?.payload?.time;
				if (playerRef?.current && typeof time === "number") {
					playerRef.current.seekTo((time / 1000) * fps);
				}
			}
		});
		const playerEventsSubscription = playerEvents.subscribe((obj) => {
			if (obj.key === PLAYER_SEEK) {
				const time = obj.value?.payload?.time;
				if (playerRef?.current && typeof time === "number") {
					playerRef.current.seekTo((time / 1000) * fps);
				}
			} else if (obj.key === PLAYER_PLAY) {
				playerRef?.current?.play();
			} else if (obj.key === PLAYER_PAUSE) {
				playerRef?.current?.pause();
			} else if (obj.key === PLAYER_TOGGLE_PLAY) {
				if (playerRef?.current?.isPlaying()) {
					playerRef.current.pause();
				} else {
					playerRef?.current?.play();
				}
			} else if (obj.key === PLAYER_SEEK_BY) {
				const frames = obj.value?.payload?.frames;
				if (playerRef?.current && typeof frames === "number") {
					const safeCurrentFrame = getSafeCurrentFrame(playerRef);
					playerRef.current.seekTo(Math.round(safeCurrentFrame) + frames);
				}
			}
		});

		return () => {
			playerEventsSubscription.unsubscribe();
			timelineEventsSubscription.unsubscribe();
		};
	}, [playerRef, fps]);

	useEffect(() => {
		const selectionEvents = subject.pipe(filter(({ key }) => key.startsWith(LAYER_PREFIX)));

		const selectionSubscription = selectionEvents.subscribe((obj) => {
			if (obj.key === LAYER_SELECTION) {
				useSelectionStore.setState({
					activeIds: obj.value?.payload.activeIds,
				});
			}
		});
		return () => selectionSubscription.unsubscribe();
	}, []);
};

export default useTimelineEvents;
