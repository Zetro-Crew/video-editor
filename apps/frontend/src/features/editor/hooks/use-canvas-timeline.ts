import type StateManager from "@designcombo/state";
import type { ITimelineScaleState } from "@designcombo/types";
import { useEffect, useRef, useState } from "react";
import { TIMELINE_OFFSET_CANVAS_LEFT, TIMELINE_OFFSET_CANVAS_RIGHT } from "../constants/constants";
import useEditorRefs from "../store/use-editor-refs";
import CanvasTimeline from "../timeline/items/timeline";

const EMPTY_SIZE = { width: 0, height: 0 };

interface UseCanvasTimelineProps {
	canvasElRef: React.RefObject<HTMLCanvasElement | null>;
	timelineContainerRef: React.RefObject<HTMLElement | null>;
	stateManager: StateManager;
	scale: ITimelineScaleState;
	duration: number;
}

const useCanvasTimeline = ({
	canvasElRef,
	timelineContainerRef,
	stateManager,
	scale,
	duration,
}: UseCanvasTimelineProps) => {
	const { setTimeline, timeline } = useEditorRefs();
	const [canvasSize, setCanvasSize] = useState(EMPTY_SIZE);
	const [scrollLeft, setScrollLeft] = useState(0);
	const canvasRef = useRef<CanvasTimeline | null>(null);
	const horizontalScrollbarVpRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const canvasEl = canvasElRef.current;
		const timelineContainerEl = timelineContainerRef.current;
		if (!canvasEl || !timelineContainerEl) return;

		const containerWidth = (document.getElementById("timeline-header")?.clientWidth || 0) - 70;
		const containerHeight =
			(document.getElementById("playhead")?.clientHeight || 0) -
			(document.getElementById("playhead-handle")?.clientHeight || 0) -
			40;

		const canvas = new CanvasTimeline(canvasEl, {
			width: containerWidth,
			height: containerHeight,
			bounding: { width: containerWidth, height: 0 },
			selectionColor: "rgba(0, 145, 255, 0.18)",
			selectionBorderColor: "rgba(0, 145, 255, 1)",
			onResizeCanvas: (payload: { width: number; height: number }) => setCanvasSize(payload),
			scale,
			state: stateManager,
			duration,
			spacing: {
				left: TIMELINE_OFFSET_CANVAS_LEFT,
				right: TIMELINE_OFFSET_CANVAS_RIGHT,
			},
			sizesMap: {
				caption: 32,
				text: 32,
				audio: 36,
				customTrack: 40,
				customTrack2: 40,
				linealAudioBars: 40,
				radialAudioBars: 40,
				waveAudioBars: 40,
				hillAudioBars: 40,
			},
			itemTypes: [
				"text",
				"image",
				"shape",
				"audio",
				"video",
				"caption",
				"helper",
				"track",
				"composition",
				"template",
				"linealAudioBars",
				"radialAudioBars",
				"progressFrame",
				"progressBar",
				"waveAudioBars",
				"hillAudioBars",
			],
			acceptsMap: {
				text: ["text", "caption"],
				image: ["image", "video"],
				video: ["video", "image"],
				audio: ["audio"],
				caption: ["caption", "text"],
				template: ["template"],
				customTrack: ["video", "image"],
				customTrack2: ["video", "image"],
				main: ["video", "image"],
				linealAudioBars: ["audio", "linealAudioBars"],
				radialAudioBars: ["audio", "radialAudioBars"],
				waveAudioBars: ["audio", "waveAudioBars"],
				hillAudioBars: ["audio", "hillAudioBars"],
			},
			guideLineColor: "rgba(239, 83, 80, 0.95)",
		});

		canvas.initScrollbars({
			offsetX: 16,
			offsetY: 0,
			extraMarginX: 50,
			extraMarginY: 0,
			scrollbarWidth: 8,
			scrollbarColor: "rgba(89, 91, 94, 1)",
		});

		canvas.onViewportChange((left: number) => setScrollLeft(left + 16));

		canvasRef.current = canvas;
		setCanvasSize({ width: containerWidth, height: containerHeight });
		setTimeline(canvas);

		return () => {
			canvas.purge();
			setTimeline(null as unknown as CanvasTimeline);
			canvasRef.current = null;
		};
	}, []);

	useEffect(() => {
		const availableScroll = horizontalScrollbarVpRef.current?.scrollWidth;
		if (!availableScroll || !timeline) return;
		const canvasWidth = timeline.width;
		if (availableScroll < canvasWidth + scrollLeft) {
			timeline.scrollTo({ scrollLeft: availableScroll - canvasWidth });
		}
	}, [scale]);

	return {
		canvasRef,
		canvasSize,
		horizontalScrollbarVpRef,
		scrollLeft,
		setScrollLeft,
	};
};

export default useCanvasTimeline;
