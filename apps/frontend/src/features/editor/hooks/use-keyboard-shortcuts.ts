import { dispatch } from "@designcombo/events";
import {
	ACTIVE_PASTE,
	ACTIVE_SPLIT,
	EDIT_OBJECT,
	HISTORY_REDO,
	HISTORY_UNDO,
	LAYER_COPY,
	LAYER_CUT,
	LAYER_DELETE,
	TIMELINE_SCALE_CHANGED,
} from "@designcombo/state";
import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { PLAYER_SEEK, PLAYER_TOGGLE_PLAY } from "../constants/events";
import useCompositionStore from "../store/use-composition-store";
import useEditorRefs from "../store/use-editor-refs";
import useLayoutStore from "../store/use-layout-store";
import useSelectionStore from "../store/use-selection-store";
import useTimelineViewStore from "../store/use-timeline-view-store";
import { getTargetById } from "../utils/target";
import { getCurrentTime } from "../utils/time";
import { getNextZoomLevel, getPreviousZoomLevel } from "../utils/timeline";

const isEditableTarget = (target: EventTarget | null): boolean => {
	if (!target) return false;
	const el = target as HTMLElement;
	return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
};

const useKeyboardShortcuts = () => {
	const { playerRef, sceneMoveableRef } = useEditorRefs(
		useShallow((s) => ({ playerRef: s.playerRef, sceneMoveableRef: s.sceneMoveableRef })),
	);
	const activeIds = useSelectionStore((s) => s.activeIds);
	const trackItemsMap = useCompositionStore((s) => s.trackItemsMap);
	const scale = useTimelineViewStore((s) => s.scale);

	const stateRef = useRef({ activeIds, trackItemsMap, scale, playerRef, sceneMoveableRef });
	stateRef.current = { activeIds, trackItemsMap, scale, playerRef, sceneMoveableRef };

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (isEditableTarget(e.target)) return;

			const { activeIds, trackItemsMap, scale, playerRef, sceneMoveableRef } = stateRef.current;
			const isMeta = e.metaKey || e.ctrlKey;

			if (e.key === "Escape") {
				useLayoutStore.getState().setControlItemOpen(false);
				return;
			}

			if (e.code === "Space") {
				e.preventDefault();
				dispatch(PLAYER_TOGGLE_PLAY);
				return;
			}

			if (e.key === "Delete" || e.key === "Backspace") {
				if (activeIds.length > 0) {
					e.preventDefault();
					dispatch(LAYER_DELETE);
				}
				return;
			}

			if (isMeta) {
				switch (e.key.toLowerCase()) {
					case "z":
						e.preventDefault();
						dispatch(e.shiftKey ? HISTORY_REDO : HISTORY_UNDO);
						break;
					case "c":
						if (activeIds.length > 0) {
							e.preventDefault();
							dispatch(LAYER_COPY);
						}
						break;
					case "x":
						if (activeIds.length > 0) {
							e.preventDefault();
							dispatch(LAYER_CUT);
						}
						break;
					case "v":
						e.preventDefault();
						dispatch(ACTIVE_PASTE);
						break;
					case "b":
						e.preventDefault();
						dispatch(ACTIVE_SPLIT, {
							payload: {},
							options: { time: getCurrentTime() },
						});
						break;
					case "=":
					case "+": {
						e.preventDefault();
						dispatch(TIMELINE_SCALE_CHANGED, {
							payload: { scale: getNextZoomLevel(scale) },
						});
						break;
					}
					case "-": {
						e.preventDefault();
						dispatch(TIMELINE_SCALE_CHANGED, {
							payload: { scale: getPreviousZoomLevel(scale) },
						});
						break;
					}
					case "arrowleft":
						e.preventDefault();
						dispatch(PLAYER_SEEK, { payload: { time: 0 } });
						break;
					case "arrowright":
						e.preventDefault();
						if (playerRef?.current) {
							playerRef.current.seekTo(playerRef.current.getCurrentFrame() + 1);
						}
						break;
				}
				return;
			}

			if (
				activeIds.length > 0 &&
				["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
			) {
				const delta = e.shiftKey ? 5 : 1;
				const payload: Record<string, { details: { top: number; left: number } }> = {};

				for (const id of activeIds) {
					const item = trackItemsMap[id];
					if (!item?.details) continue;
					const top = Number.parseFloat(item.details.top as unknown as string) || 0;
					const left = Number.parseFloat(item.details.left as unknown as string) || 0;

					switch (e.key) {
						case "ArrowUp":
							payload[id] = { details: { top: top - delta, left } };
							break;
						case "ArrowDown":
							payload[id] = { details: { top: top + delta, left } };
							break;
						case "ArrowLeft":
							payload[id] = { details: { top, left: left - delta } };
							break;
						case "ArrowRight":
							payload[id] = { details: { top, left: left + delta } };
							break;
					}
				}

				if (Object.keys(payload).length > 0) {
					e.preventDefault();
					for (const [id, { details }] of Object.entries(payload)) {
						const el = getTargetById(id);
						if (el) {
							el.style.top = `${details.top}px`;
							el.style.left = `${details.left}px`;
						}
					}
					dispatch(EDIT_OBJECT, { payload });
					requestAnimationFrame(() => {
						sceneMoveableRef?.current?.moveable.updateRect();
					});
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);
};

export default useKeyboardShortcuts;
