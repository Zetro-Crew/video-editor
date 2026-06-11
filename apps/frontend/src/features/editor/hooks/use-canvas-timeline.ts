import type StateManager from "@designcombo/state";
import type { ITimelineScaleState } from "@designcombo/types";
import { useCallback, useEffect, useRef, useState } from "react";
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
	const { setTimeline } = useEditorRefs();
	const [canvasSize, setCanvasSize] = useState(EMPTY_SIZE);
	const [scrollLeft, setScrollLeft] = useState(0);
	const canvasRef = useRef<CanvasTimeline | null>(null);
	const horizontalScrollbarVpRef = useRef<HTMLDivElement>(null);
	// Always-current mirrors of state — let callbacks read latest values without
	// being listed as effect deps (which would cause effects to fire on every change).
	const scrollLeftRef = useRef(scrollLeft);
	scrollLeftRef.current = scrollLeft;
	const canvasSizeRef = useRef(canvasSize);
	canvasSizeRef.current = canvasSize;

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

		// initScrollbars registers the mouse-wheel pan handler and the onViewportChange callback.
		// After init, suppress the canvas-drawn scrollbars entirely (hideX/hideY) so they never
		// render on the canvas bitmap. The HTML div in timeline.tsx replaces the horizontal one;
		// vertical scrolling is not needed in this layout.
		canvas.initScrollbars({
			offsetX: 16,
			offsetY: 0,
			extraMarginX: 50,
			extraMarginY: 0,
			scrollbarWidth: 8,
			scrollbarColor: "rgba(0, 0, 0, 0)",
		});
		const internalScrollbars = (
			canvas as unknown as { _scrollbars?: { hideX: boolean; hideY: boolean } }
		)._scrollbars;
		if (internalScrollbars) {
			internalScrollbars.hideX = true;
			internalScrollbars.hideY = true;
		}

		canvas.onViewportChange((left: number) => {
			const newScrollLeft = left + 16;
			const scrollbarEl = horizontalScrollbarVpRef.current;
			// Canvas-initiated scroll (mouse-wheel pan, drag). Canvas already moved
			// itself — do NOT call scrollTo() here (circular). Only sync the DOM
			// scrollbar and state mirrors.
			const maxScroll =
				scrollbarEl && scrollbarEl.clientWidth > 0
					? Math.max(0, scrollbarEl.scrollWidth - scrollbarEl.clientWidth)
					: Number.POSITIVE_INFINITY;
			const clamped = Math.min(Math.max(newScrollLeft, 0), maxScroll);
			scrollLeftRef.current = clamped;
			setScrollLeft(clamped);
			if (scrollbarEl) scrollbarEl.scrollLeft = clamped;
		});

		canvasRef.current = canvas;
		setCanvasSize({ width: containerWidth, height: containerHeight });
		setTimeline(canvas);

		return () => {
			canvas.purge();
			setTimeline(null as unknown as CanvasTimeline);
			canvasRef.current = null;
		};
	}, []);

	// ─── Canonical scroll write paths ───────────────────────────────────────────
	// scrollTo (horizontal) and scrollToVertical are the ONLY functions that write
	// scroll positions. All external callers must go through here so clamping and
	// canvas sync happen exactly once. Do NOT call either from onViewportChange —
	// the canvas already moved itself on that path.
	const scrollTo = useCallback((desired: number): void => {
		const scrollbarEl = horizontalScrollbarVpRef.current;
		const canvas = canvasRef.current;
		if (!scrollbarEl || !canvas || scrollbarEl.clientWidth === 0) return;

		const maxScroll = Math.max(0, scrollbarEl.scrollWidth - scrollbarEl.clientWidth);
		const clamped = Math.min(Math.max(desired, 0), maxScroll);

		canvas.scrollTo({ scrollLeft: clamped });
		scrollbarEl.scrollLeft = clamped;
		scrollLeftRef.current = clamped;
		setScrollLeft(clamped);
	}, [setScrollLeft]);

	// Clamps and applies a vertical scroll position. contentHeight must be the
	// total height of all currently-rendered tracks (from computeTracksHeight).
	const scrollToVertical = useCallback((desiredTop: number, contentHeight: number): void => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const canvasHeight = (canvas as unknown as { height: number }).height;
		const maxScrollTop = Math.max(0, contentHeight - canvasHeight);
		const clamped = Math.min(Math.max(desiredTop, 0), maxScrollTop);
		canvas.scrollTo({ scrollTop: clamped });
	}, []);

	// resyncScroll is the reactive path: triggered by layout events (scale / duration
	// change, track toggle, canvas resize, window resize). It delegates to scrollTo
	// and early-exits when scrollLeft is already within bounds so it never causes
	// unnecessary canvas redraws.
	const resyncScroll = useCallback(() => {
		const scrollbarEl = horizontalScrollbarVpRef.current;
		if (!scrollbarEl || scrollbarEl.clientWidth === 0) return;
		const maxScroll = Math.max(0, scrollbarEl.scrollWidth - scrollbarEl.clientWidth);
		if (scrollLeftRef.current <= maxScroll) return;
		scrollTo(scrollLeftRef.current);
	}, [scrollTo]);

	// Trigger: scale or duration change (content width shrinks or grows).
	useEffect(() => {
		// RAF ensures the scrollbar inner-div has been painted at its new width
		// before we measure scrollWidth — without it we may read the previous frame.
		const id = requestAnimationFrame(resyncScroll);
		return () => cancelAnimationFrame(id);
	}, [scale, duration, resyncScroll]);

	// Trigger: canvasSize change — fired by applyTimelineLayout after track
	// visibility toggle and by the library on any canvas resize.
	useEffect(() => {
		const id = requestAnimationFrame(resyncScroll);
		return () => cancelAnimationFrame(id);
	}, [canvasSize, resyncScroll]);

	// Trigger: window resize and timeline-container resize (covers browser zoom,
	// window size changes, and any responsive layout reflow that changes clientWidth).
	//
	// Browser zoom is the critical case: it changes the CSS-pixel dimensions of every
	// DOM element (container, ruler, scrollbar, header) EXCEPT the <canvas> element,
	// whose width attribute is fixed at init. After zoom the canvas is the wrong size
	// relative to everything else — ruler ticks, header, and scrollbar are all misaligned.
	//
	// The fix: re-measure the header width after the layout settles (one RAF), then call
	// canvas.resize() so the canvas matches the new CSS-pixel container width. The library
	// fires onResizeCanvas → setCanvasSize, which triggers the [canvasSize] effect that
	// calls resyncScroll — so scroll clamping is handled automatically from that path.
	// We still call resyncScroll() directly here as a safety net for the case where
	// resize did not change canvasSize (width difference below the > 1 threshold).
	useEffect(() => {
		let rafId: number | null = null;
		const handleResize = () => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				const headerEl = document.getElementById("timeline-header");
				const canvas = canvasRef.current;
				if (headerEl && canvas) {
					const newWidth = Math.max(1, headerEl.clientWidth - 70);
					if (Math.abs(newWidth - canvasSizeRef.current.width) > 1) {
						// Resize canvas to match the post-zoom / post-resize container width.
						// Pass current height so only the width changes.
						canvas.resize({ width: newWidth, height: canvasSizeRef.current.height });
					}
				}
				resyncScroll();
			});
		};

		window.addEventListener("resize", handleResize);

		const containerEl = timelineContainerRef.current;
		const ro = containerEl ? new ResizeObserver(handleResize) : null;
		if (ro && containerEl) ro.observe(containerEl);

		return () => {
			window.removeEventListener("resize", handleResize);
			ro?.disconnect();
			if (rafId !== null) cancelAnimationFrame(rafId);
		};
	}, [resyncScroll, timelineContainerRef]);

	return {
		canvasRef,
		canvasSize,
		horizontalScrollbarVpRef,
		scrollLeft,
		scrollLeftRef,
		scrollTo,
		scrollToVertical,
	};
};

export default useCanvasTimeline;
