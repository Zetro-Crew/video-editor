import { timeMsToUnits } from "@designcombo/timeline";
import type { ITimelineScaleState } from "@designcombo/types";
import { type RefObject, useEffect, useRef } from "react";

interface UsePlayheadAutoScrollProps {
	currentFrame: number;
	fps: number;
	scale: ITimelineScaleState;
	scrollLeftRef: RefObject<number>;
	canvasElRef: RefObject<HTMLCanvasElement | null>;
	horizontalScrollbarVpRef: RefObject<HTMLDivElement | null>;
	onScroll: (newScrollLeft: number) => void;
}

const usePlayheadAutoScroll = ({
	currentFrame,
	fps,
	scale,
	scrollLeftRef,
	canvasElRef,
	horizontalScrollbarVpRef,
	onScroll,
}: UsePlayheadAutoScrollProps) => {
	const canvasBoundingXRef = useRef(0);
	// Stable ref so the effect callback always reads the latest scrollTo without
	// being listed as a reactive dep (which would cause unnecessary re-runs).
	const onScrollRef = useRef(onScroll);
	onScrollRef.current = onScroll;

	useEffect(() => {
		const el = canvasElRef.current;
		if (!el) return;
		const update = () => {
			canvasBoundingXRef.current = el.getBoundingClientRect().x + el.clientWidth;
		};
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, [canvasElRef]);

	useEffect(() => {
		const horizontalScrollbar = horizontalScrollbarVpRef.current;
		if (!horizontalScrollbar) return;

		const position = timeMsToUnits((currentFrame / fps) * 1000, scale.zoom);
		// scrollLeftRef.current is updated synchronously inside the canonical scrollTo()
		// — no React render cycle lag, so this reads the exact current canvas position.
		const playheadPos = position - scrollLeftRef.current + 40;

		if (playheadPos < canvasBoundingXRef.current) return;

		const scrollDivWidth = horizontalScrollbar.clientWidth;
		const totalScrollWidth = horizontalScrollbar.scrollWidth;
		const currentPosScroll = horizontalScrollbar.scrollLeft;
		const availableScroll = totalScrollWidth - (scrollDivWidth + currentPosScroll);
		const scaleScroll = availableScroll / scrollDivWidth;

		if (scaleScroll < 0) return;
		const newLeft =
			scaleScroll > 1 ? currentPosScroll + scrollDivWidth : totalScrollWidth - scrollDivWidth;
		onScrollRef.current(newLeft);
	}, [currentFrame, fps, scale, scrollLeftRef, horizontalScrollbarVpRef]);
};

export default usePlayheadAutoScroll;
