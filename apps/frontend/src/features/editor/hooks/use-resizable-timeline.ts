import React from "react";
import useEditorRefs from "../store/use-editor-refs";

export const useResizbleTimeline = () => {
	const isResizingRef = React.useRef(false);
	const timelineContainerRef = React.useRef<HTMLDivElement>(null);
	const [timelineHeight, setTimelineHeight] = React.useState(320);
	const { timeline } = useEditorRefs();

	const onMouseDown = (ev: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
		const rect = timelineContainerRef.current?.getBoundingClientRect();
		if (!rect) return;
		const { y } = rect;
		const cursorPosition = ev.clientY - y;
		if (cursorPosition > 15 || cursorPosition < -15) return;
		isResizingRef.current = true;

		const startY = ev.clientY;
		const initialTimelineHeight = timelineContainerRef.current?.offsetHeight ?? 0;
		let currentHeight = 0;

		const onMouseMove = (ev: MouseEvent) => {
			currentHeight = initialTimelineHeight + startY - ev.clientY;

			if (currentHeight < 50 || currentHeight >= window.innerHeight * 0.5) {
				ev.preventDefault();
				return;
			}
			if (timelineContainerRef.current) {
				timelineContainerRef.current.style.height = `${currentHeight}px`;
				timelineContainerRef.current.style.borderTopColor = "#2B64EB";
				timelineContainerRef.current.style.cursor = "row-resize";
			}
			const containerHeight =
				(document.getElementById("playhead")?.clientHeight || 0) -
				(document.getElementById("playhead-handle")?.clientHeight || 0);
			timeline?.resize({
				height: containerHeight,
			});
			setTimelineHeight(currentHeight);
		};
		const onMouseUp = () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			isResizingRef.current = false;
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
	};

	const onMouseMove = (ev: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
		if (isResizingRef.current) return;
		const rect = timelineContainerRef.current?.getBoundingClientRect();
		if (!rect) return;
		const { y } = rect;
		const cursorPosition = ev.clientY - y;

		if (!timelineContainerRef.current) return;
		if (cursorPosition <= 15 && cursorPosition >= -15) {
			timelineContainerRef.current.style.cursor = "row-resize";
			timelineContainerRef.current.style.borderTopColor = "#2B64EB";
		} else {
			timelineContainerRef.current.style.borderTopColor = "transparent";
			timelineContainerRef.current.style.cursor = "default";
		}
	};

	const onMouseOut = () => {
		if (isResizingRef.current) return;
		if (!timelineContainerRef.current) return;
		timelineContainerRef.current.style.borderTopColor = "transparent";
		timelineContainerRef.current.style.cursor = "default";
	};

	React.useEffect(() => {
		if (!timelineContainerRef.current) return;

		setTimelineHeight(timelineContainerRef.current.clientHeight);
	}, []); // run once on mount — ref.current is never a valid dep

	return {
		timelineContainerRef,
		onMouseDown,
		onMouseMove,
		onMouseOut,
		timelineHeight,
	};
};
