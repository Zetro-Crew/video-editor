import { useCallback, useEffect, useRef, useState } from "react";

export const EDGE_ZONE_WIDTH = 36; // px from track edge to trigger zone
const DWELL_DELAY_MS = 600; // ms the mouse must stay before scroll starts
const BASE_SPEED = 1.5; // px/frame at edge boundary
const MAX_SPEED = 7; // px/frame at edge tip

export type EdgeScrollSide = "left" | "right" | null;
export type EdgeScrollPhase = "dwell" | "scrolling" | null;

export interface EdgeScrollState {
	side: EdgeScrollSide;
	phase: EdgeScrollPhase;
}

interface UseTimelineEdgeScrollOptions {
	scrollLeftRef: React.MutableRefObject<number>;
	onScroll: (newScrollLeft: number) => void;
}

export const useTimelineEdgeScroll = ({
	scrollLeftRef,
	onScroll,
}: UseTimelineEdgeScrollOptions) => {
	const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const rafRef = useRef<number>(0);
	const activeDirectionRef = useRef<-1 | 0 | 1>(0);
	const speedRef = useRef(BASE_SPEED);
	const onScrollRef = useRef(onScroll);
	const [edgeState, setEdgeState] = useState<EdgeScrollState>({ side: null, phase: null });

	useEffect(() => {
		onScrollRef.current = onScroll;
	}, [onScroll]);

	const stopEdgeScroll = useCallback(() => {
		if (dwellTimerRef.current !== null) {
			clearTimeout(dwellTimerRef.current);
			dwellTimerRef.current = null;
		}
		cancelAnimationFrame(rafRef.current);
		activeDirectionRef.current = 0;
		setEdgeState({ side: null, phase: null });
	}, []);

	const startScrollLoop = useCallback(
		(dir: -1 | 1) => {
			activeDirectionRef.current = dir;
			setEdgeState({ side: dir === -1 ? "left" : "right", phase: "scrolling" });
			const tick = () => {
				if (activeDirectionRef.current === 0) return;
				const next = Math.max(
					0,
					scrollLeftRef.current + activeDirectionRef.current * speedRef.current,
				);
				onScrollRef.current(next);
				rafRef.current = requestAnimationFrame(tick);
			};
			cancelAnimationFrame(rafRef.current);
			rafRef.current = requestAnimationFrame(tick);
		},
		[scrollLeftRef],
	);

	const onEdgeMouseMove = useCallback(
		(trackRelativeX: number, trackAreaWidth: number) => {
			const distFromLeft = trackRelativeX;
			const distFromRight = trackAreaWidth - trackRelativeX;

			let dir: -1 | 0 | 1 = 0;
			let speed = BASE_SPEED;

			if (distFromLeft >= 0 && distFromLeft < EDGE_ZONE_WIDTH) {
				dir = -1;
				const t = 1 - distFromLeft / EDGE_ZONE_WIDTH;
				speed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * t;
			} else if (distFromRight >= 0 && distFromRight < EDGE_ZONE_WIDTH) {
				dir = 1;
				const t = 1 - distFromRight / EDGE_ZONE_WIDTH;
				speed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * t;
			}

			if (dir === 0) {
				stopEdgeScroll();
				return;
			}

			speedRef.current = speed;

			if (activeDirectionRef.current === dir) return;

			stopEdgeScroll();
			const capturedDir = dir;
			setEdgeState({ side: dir === -1 ? "left" : "right", phase: "dwell" });
			dwellTimerRef.current = setTimeout(() => {
				dwellTimerRef.current = null;
				startScrollLoop(capturedDir);
			}, DWELL_DELAY_MS);
		},
		[stopEdgeScroll, startScrollLoop],
	);

	useEffect(() => () => stopEdgeScroll(), [stopEdgeScroll]);

	return { onEdgeMouseMove, stopEdgeScroll, edgeState };
};
