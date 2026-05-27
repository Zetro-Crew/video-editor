import { useTheme } from "next-themes";
import {
	type MouseEvent,
	type TouchEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { TIMELINE_OFFSET_CANVAS_LEFT } from "../constants/constants";
import { useCurrentPlayerFrame } from "../hooks/use-current-frame";
import { useTimelineOffsetX } from "../hooks/use-timeline-offset";
import useCompositionStore from "../store/use-composition-store";
import useEditorRefs from "../store/use-editor-refs";
import useTimelineViewStore from "../store/use-timeline-view-store";
import { timeMsToUnits, unitsToTimeMs } from "../utils/timeline";

const Playhead = ({ scrollLeft }: { scrollLeft: number }) => {
	const playheadRef = useRef<HTMLDivElement>(null);
	const { playerRef } = useEditorRefs();
	const fps = useCompositionStore((s) => s.fps);
	const { scale } = useTimelineViewStore();
	const currentFrame = useCurrentPlayerFrame(playerRef);
	const position = useMemo(
		() => timeMsToUnits((currentFrame / fps) * 1000, scale.zoom) - scrollLeft,
		[currentFrame, fps, scale.zoom, scrollLeft],
	);
	const [isDragging, setIsDragging] = useState(false);
	const timelineOffsetX = useTimelineOffsetX();

	// Stable refs for drag state — prevents stale closures in memoized handlers
	const dragStartXRef = useRef(0);
	const dragStartPositionRef = useRef(0);
	const scrollLeftRef = useRef(scrollLeft);
	const scaleRef = useRef(scale);
	const fpsRef = useRef(fps);
	scrollLeftRef.current = scrollLeft;
	scaleRef.current = scale;
	fpsRef.current = fps;

	const { theme, resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);

	const color = useMemo(() => {
		if (!mounted) return "#0091ff";
		const t = theme === "system" ? resolvedTheme : theme;
		return t === "dark" ? "#ef5350" : "#0091ff";
	}, [mounted, theme, resolvedTheme]);

	const handleMouseUp = useCallback(() => {
		setIsDragging(false);
	}, []);

	const handleMouseDown = (
		e: MouseEvent<HTMLDivElement, globalThis.MouseEvent> | TouchEvent<HTMLDivElement>,
	) => {
		e.preventDefault();
		setIsDragging(true);
		const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
		dragStartXRef.current = clientX;
		dragStartPositionRef.current = position;
	};

	const handleMouseMove = useCallback(
		(e: globalThis.MouseEvent | globalThis.TouchEvent) => {
			e.preventDefault();
			const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
			const delta = clientX - dragStartXRef.current + scrollLeftRef.current;
			const newPosition = dragStartPositionRef.current + delta;
			const time = unitsToTimeMs(newPosition, scaleRef.current.zoom);
			playerRef?.current?.seekTo(Math.round((time * fpsRef.current) / 1000));
		},
		[playerRef],
	);

	useEffect(() => {
		const preventDefaultDrag = (e: Event) => e.preventDefault();

		if (isDragging) {
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			document.addEventListener("touchmove", handleMouseMove);
			document.addEventListener("touchend", handleMouseUp);
			document.addEventListener("dragstart", preventDefaultDrag);
		}

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.removeEventListener("touchmove", handleMouseMove);
			document.removeEventListener("touchend", handleMouseUp);
			document.removeEventListener("dragstart", preventDefaultDrag);
		};
	}, [isDragging, handleMouseMove, handleMouseUp]);

	return (
		<div
			ref={playheadRef}
			onMouseDown={handleMouseDown}
			onTouchStart={handleMouseDown}
			onDragStart={(e) => e.preventDefault()}
			id="playhead"
			style={{
				position: "absolute",
				left: timelineOffsetX + TIMELINE_OFFSET_CANVAS_LEFT + position,
				top: 50,
				width: 1,
				height: "calc(100% - 40px)",
				zIndex: 10,
				cursor: "pointer",
				touchAction: "none", // Prevent default touch actions
			}}
		>
			<div
				id="playhead-handle"
				style={{
					borderRadius: "0 0 4px 4px",
					backgroundColor: color,
				}}
				className="absolute top-0 h-4 w-2 -translate-x-1/2 transform text-xs font-semibold text-foreground"
			/>
			<div className="relative h-full">
				<div className="absolute top-0 h-full w-3 -translate-x-1/2 transform" />
				<div
					className="absolute top-0 h-full w-0.5 -translate-x-1/2 transform"
					style={{ backgroundColor: color }}
				/>
			</div>
		</div>
	);
};

export default Playhead;
