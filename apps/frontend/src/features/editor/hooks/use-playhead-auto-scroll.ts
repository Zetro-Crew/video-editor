import { timeMsToUnits } from "@designcombo/timeline";
import type { ITimelineScaleState } from "@designcombo/types";
import { type RefObject, useEffect, useRef } from "react";

interface UsePlayheadAutoScrollProps {
	currentFrame: number;
	fps: number;
	scale: ITimelineScaleState;
	scrollLeft: number;
	canvasElRef: RefObject<HTMLCanvasElement | null>;
	horizontalScrollbarVpRef: RefObject<HTMLDivElement | null>;
}

const usePlayheadAutoScroll = ({
	currentFrame,
	fps,
	scale,
	scrollLeft,
	canvasElRef,
	horizontalScrollbarVpRef,
}: UsePlayheadAutoScrollProps) => {
	const canvasBoundingXRef = useRef(0);

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
		const playheadPos = position - scrollLeft + 40;

		if (playheadPos < canvasBoundingXRef.current) return;

		const scrollDivWidth = horizontalScrollbar.clientWidth;
		const totalScrollWidth = horizontalScrollbar.scrollWidth;
		const currentPosScroll = horizontalScrollbar.scrollLeft;
		const availableScroll = totalScrollWidth - (scrollDivWidth + currentPosScroll);
		const scaleScroll = availableScroll / scrollDivWidth;

		if (scaleScroll < 0) return;
		horizontalScrollbar.scrollTo({
			left: scaleScroll > 1 ? currentPosScroll + scrollDivWidth : totalScrollWidth - scrollDivWidth,
		});
	}, [currentFrame, fps, scale, scrollLeft, horizontalScrollbarVpRef]);
};

export default usePlayheadAutoScroll;
