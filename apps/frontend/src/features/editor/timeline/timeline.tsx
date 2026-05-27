import type StateManager from "@designcombo/state";
import { unitsToTimeMs } from "@designcombo/timeline";
import { useTheme } from "next-themes";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { TIMELINE_OFFSET_CANVAS_LEFT } from "../constants/constants";
import useCanvasTimeline from "../hooks/use-canvas-timeline";
import { useCurrentPlayerFrame } from "../hooks/use-current-frame";
import usePlayheadAutoScroll from "../hooks/use-playhead-auto-scroll";
import { useResizbleTimeline } from "../hooks/use-resizable-timeline";
import { useStateManagerEvents } from "../hooks/use-state-manager-events";
import { useTimelineOffsetX } from "../hooks/use-timeline-offset";
import useCompositionStore from "../store/use-composition-store";
import useEditorRefs from "../store/use-editor-refs";
import useTimelineViewStore from "../store/use-timeline-view-store";
import Header from "./header";
import HoverPlayhead from "./hover-playhead";
import Audio from "./items/audio";
import Caption from "./items/caption";
import Helper from "./items/helper";
import HillAudioBars from "./items/hill-audio-bars";
import Image from "./items/image";
import LinealAudioBars from "./items/lineal-audio-bars";
import PreviewTrackItem from "./items/preview-drag-item";
import RadialAudioBars from "./items/radial-audio-bars";
import Shape from "./items/shape";
import Text from "./items/text";
import CanvasTimeline from "./items/timeline";
import Track from "./items/track";
import Video from "./items/video";
import WaveAudioBars from "./items/wave-audio-bars";
import Playhead from "./playhead";
import Ruler from "./ruler";

CanvasTimeline.registerItems({
	Text,
	Image,
	Shape,
	Audio,
	Video,
	Caption,
	Helper,
	Track,
	PreviewTrackItem,
	LinealAudioBars,
	RadialAudioBars,
	WaveAudioBars,
	HillAudioBars,
});

const Timeline = ({ stateManager }: { stateManager: StateManager }) => {
	const canvasElRef = useRef<HTMLCanvasElement>(null);
	const { scale } = useTimelineViewStore();
	const fps = useCompositionStore((s) => s.fps);
	const duration = useCompositionStore((s) => s.duration);
	const { playerRef } = useEditorRefs();
	const currentFrame = useCurrentPlayerFrame(playerRef);
	const timelineOffsetX = useTimelineOffsetX();
	const { theme } = useTheme();
	const { timelineContainerRef, timelineHeight, onMouseDown, onMouseMove, onMouseOut } =
		useResizbleTimeline();

	const { canvasRef, canvasSize, horizontalScrollbarVpRef, scrollLeft, setScrollLeft } =
		useCanvasTimeline({
			canvasElRef,
			timelineContainerRef,
			stateManager,
			scale,
			duration,
		});

	const containerRef = useRef<HTMLDivElement>(null);
	const containerRectRef = useRef<DOMRect | null>(null);
	const hoverRafRef = useRef<number>(0);
	const [hoverState, setHoverState] = useState<{
		left: number;
		timeMs: number;
	} | null>(null);
	const [itemTooltip, setItemTooltip] = useState<{
		left: number;
		top: number;
		name: string;
	} | null>(null);

	useEffect(() => {
		const el = timelineContainerRef.current;
		if (!el) return;
		const update = () => {
			containerRectRef.current = el.getBoundingClientRect();
		};
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, [timelineContainerRef]);

	const trackItemIds = useCompositionStore((s) => s.trackItemIds);

	useStateManagerEvents(stateManager);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		for (const obj of canvas.getObjects()) {
			if (obj instanceof Video && !trackItemIds.includes(obj.id)) {
				obj.destroy();
			}
		}
	}, [trackItemIds]);

	usePlayheadAutoScroll({
		currentFrame,
		fps,
		scale,
		scrollLeft,
		canvasElRef,
		horizontalScrollbarVpRef,
	});

	useEffect(() => {
		const timeout = setTimeout(() => {
			canvasRef.current?.requestRenderAll();
		}, 5);
		return () => clearTimeout(timeout);
	}, [theme]);

	const mouseXToTimeMs = (clientX: number): number | null => {
		const rect = containerRectRef.current;
		if (!rect) return null;
		const relativeX = clientX - rect.left;
		const unitsX = relativeX - timelineOffsetX - TIMELINE_OFFSET_CANVAS_LEFT + scrollLeft;
		if (unitsX < 0) return null;
		return unitsToTimeMs(unitsX, scale.zoom);
	};

	const onClickRuler = (units: number) => {
		const time = unitsToTimeMs(units, scale.zoom);
		playerRef?.current?.seekTo(Math.round((time * fps) / 1000));
	};

	const onRulerScroll = (newScrollLeft: number) => {
		canvasRef.current?.scrollTo({ scrollLeft: newScrollLeft });
		if (horizontalScrollbarVpRef.current) {
			horizontalScrollbarVpRef.current.scrollLeft = newScrollLeft;
		}
		setScrollLeft(newScrollLeft);
	};

	const onTracksMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		const rect = containerRectRef.current;
		if (!rect) return;
		const clientX = e.clientX;
		const clientY = e.clientY;
		cancelAnimationFrame(hoverRafRef.current);
		hoverRafRef.current = requestAnimationFrame(() => {
			const relativeX = clientX - rect.left;
			const unitsX = relativeX - timelineOffsetX - TIMELINE_OFFSET_CANVAS_LEFT + scrollLeft;
			if (unitsX < 0) return;
			const timeMs = unitsToTimeMs(unitsX, scale.zoom);
			setHoverState({ left: relativeX, timeMs });

			const canvas = canvasRef.current;
			if (canvas) {
				const canvasEl = document.getElementById("designcombo-timeline-canvas");
				if (canvasEl) {
					const canvasRect = canvasEl.getBoundingClientRect();
					const vt = canvas.viewportTransform;
					const sceneX = (clientX - canvasRect.left - vt[4]) / vt[0];
					const sceneY = (clientY - canvasRect.top - vt[5]) / vt[3];
					const pt = { x: sceneX, y: sceneY };
					type CanvasItemWithMeta = {
						metadata?: { displayName?: string };
						containsPoint: (p: { x: number; y: number }) => boolean;
					};
					const objects = canvas.getObjects() as unknown as CanvasItemWithMeta[];
					const hit = objects.find((obj) => obj.metadata?.displayName && obj.containsPoint(pt));
					const hitName = hit?.metadata?.displayName ?? null;
					setItemTooltip(
						hitName
							? {
									left: clientX - rect.left,
									top: clientY - rect.top - 36,
									name: hitName,
								}
							: null,
					);
				}
			}
		});
	};

	const onTracksClick = (e: React.MouseEvent<HTMLDivElement>) => {
		const timeMs = mouseXToTimeMs(e.clientX);
		if (timeMs === null) return;
		playerRef?.current?.seekTo(Math.round((timeMs * fps) / 1000));
	};

	return (
		<div
			ref={timelineContainerRef}
			id="timeline-container"
			className="relative w-full overflow-hidden bg-card"
			style={{
				height: `${timelineHeight}px`,
				borderTopWidth: "1px",
				borderTopStyle: "solid",
				borderTopColor: "transparent",
			}}
			onMouseDown={onMouseDown}
			onMouseMove={onMouseMove}
			onMouseOut={onMouseOut}
		>
			<Header />
			<Ruler onClick={onClickRuler} scrollLeft={scrollLeft} onScroll={onRulerScroll} />
			<Playhead scrollLeft={scrollLeft} />
			{hoverState && <HoverPlayhead left={hoverState.left} timeMs={hoverState.timeMs} />}
			{itemTooltip && (
				<div
					className="pointer-events-none absolute z-50 rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
					style={{ left: itemTooltip.left, top: itemTooltip.top }}
				>
					{itemTooltip.name}
				</div>
			)}
			<div className="flex">
				<div style={{ width: timelineOffsetX }} className="relative flex-none" />
				<div
					style={{ height: canvasSize.height }}
					className="relative flex-1"
					onMouseMove={onTracksMouseMove}
					onMouseLeave={() => {
						cancelAnimationFrame(hoverRafRef.current);
						setHoverState(null);
						setItemTooltip(null);
					}}
					onClick={onTracksClick}
				>
					<div
						style={{ height: canvasSize.height }}
						ref={containerRef}
						className="absolute top-0 w-full"
					>
						<canvas id="designcombo-timeline-canvas" ref={canvasElRef} />
					</div>
				</div>
			</div>
		</div>
	);
};

export default Timeline;
