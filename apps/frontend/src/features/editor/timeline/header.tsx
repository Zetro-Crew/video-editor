import { dispatch } from "@designcombo/events";
import {
	ACTIVE_SPLIT,
	LAYER_CLONE,
	LAYER_DELETE,
	TIMELINE_SCALE_CHANGED,
} from "@designcombo/state";
import type { ITimelineScaleState } from "@designcombo/types";
import { CopyPlus, SquareSplitHorizontal, Trash, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMediumScreen } from "@/hooks/use-media-query";
import { PLAYER_PAUSE, PLAYER_PLAY } from "../constants/events";
import { useCurrentPlayerFrame } from "../hooks/use-current-frame";
import { useTimelineOffsetX } from "../hooks/use-timeline-offset";
import useUpdateAnsestors from "../hooks/use-update-ansestors";
import useCompositionStore from "../store/use-composition-store";
import useEditorRefs from "../store/use-editor-refs";
import useSelectionStore from "../store/use-selection-store";
import useTimelineViewStore from "../store/use-timeline-view-store";
import { frameToTimeString, getCurrentTime, timeToString } from "../utils/time";
import {
	getFitZoomLevel,
	getNextZoomLevel,
	getPreviousZoomLevel,
	getZoomByIndex,
} from "../utils/timeline";

const IconPlayerPlayFilled = ({ size }: { size: number }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width={size} viewBox="0 0 24 24" fill="currentColor">
		<path stroke="none" d="M0 0h24v24H0z" fill="none" />
		<path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" />
	</svg>
);

const IconPlayerPauseFilled = ({ size }: { size: number }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width={size} viewBox="0 0 24 24" fill="currentColor">
		<path stroke="none" d="M0 0h24v24H0z" fill="none" />
		<path d="M9 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z" />
		<path d="M17 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z" />
	</svg>
);
const IconPlayerSkipBack = ({ size }: { size: number }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path stroke="none" d="M0 0h24v24H0z" fill="none" />
		<path d="M20 5v14l-12 -7z" />
		<path d="M4 5l0 14" />
	</svg>
);

const IconPlayerSkipForward = ({ size }: { size: number }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path stroke="none" d="M0 0h24v24H0z" fill="none" />
		<path d="M4 5v14l12 -7z" />
		<path d="M20 5l0 14" />
	</svg>
);
const Header = () => {
	const [playing, setPlaying] = useState(false);
	const { duration, fps } = useCompositionStore();
	const { scale } = useTimelineViewStore();
	const { playerRef } = useEditorRefs();
	const { activeIds } = useSelectionStore();
	const isLargeScreen = useIsMediumScreen();
	useUpdateAnsestors({ playing, playerRef });

	const currentFrame = useCurrentPlayerFrame(playerRef);

	const doActiveDelete = () => {
		dispatch(LAYER_DELETE);
	};

	const doActiveSplit = () => {
		dispatch(ACTIVE_SPLIT, {
			payload: {},
			options: {
				time: getCurrentTime(),
			},
		});
	};

	const changeScale = (scale: ITimelineScaleState) => {
		dispatch(TIMELINE_SCALE_CHANGED, {
			payload: {
				scale,
			},
		});
	};

	const handlePlay = () => {
		dispatch(PLAYER_PLAY);
	};

	const handlePause = () => {
		dispatch(PLAYER_PAUSE);
	};

	useEffect(() => {
		const player = playerRef?.current;
		if (!player) return;

		const handlePlay = () => {
			setPlaying(true);
		};
		const handlePause = () => {
			setPlaying(false);
		};

		player.addEventListener("play", handlePlay);
		player.addEventListener("pause", handlePause);
		return () => {
			player.removeEventListener("play", handlePlay);
			player.removeEventListener("pause", handlePause);
		};
	}, [playerRef]);

	return (
		<div
			id="timeline-header"
			style={{
				position: "relative",
				height: "56px",
				flex: "none",
			}}
		>
			<div
				style={{
					position: "absolute",
					height: 56,
					width: "100%",
					display: "flex",
					alignItems: "center",
				}}
			>
				<div
					style={{
						height: 44,
						width: "100%",
						display: "grid",
						gridTemplateColumns: isLargeScreen ? "1fr 260px 1fr" : "1fr 1fr 1fr",
						alignItems: "center",
					}}
				>
					<div className="flex px-2">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									disabled={!activeIds.length}
									onClick={doActiveDelete}
									variant={"ghost"}
									size={isLargeScreen ? "default" : "icon"}
									className="flex items-center gap-1.5 px-3"
								>
									<Trash size={18} aria-hidden="true" />
									<span className="hidden md:block text-sm font-medium">מחק</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">מחק שכבה</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									disabled={!activeIds.length}
									onClick={doActiveSplit}
									variant={"ghost"}
									size={isLargeScreen ? "default" : "icon"}
									className="flex items-center gap-1.5 px-3"
								>
									<SquareSplitHorizontal size={18} aria-hidden="true" />
									<span className="hidden md:block text-sm font-medium">פצל</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">פצל בנקודת הסמן</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									disabled={!activeIds.length}
									onClick={() => {
										dispatch(LAYER_CLONE);
									}}
									variant={"ghost"}
									size={isLargeScreen ? "default" : "icon"}
									className="flex items-center gap-1.5 px-3"
								>
									<CopyPlus size={18} aria-hidden="true" />
									<span className="hidden md:block text-sm font-medium">שכפל</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">שכפל שכבה</TooltipContent>
						</Tooltip>
					</div>
					<div className="flex flex-col items-center justify-center gap-0.5">
						<div className="flex items-center justify-center tabular-nums">
							<div className="text-xs text-muted-foreground hidden md:block">
								{timeToString({ time: duration })}
							</div>
							<span className="px-1 text-xs text-muted-foreground">|</span>
							<div
								className="text-xs font-medium text-foreground"
								data-current-time={currentFrame / fps}
								id="video-current-time"
							>
								{frameToTimeString({ frame: currentFrame }, { fps })}
							</div>
						</div>
						<div>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										className="hidden md:inline-flex"
										onClick={doActiveSplit}
										variant={"ghost"}
										size={"icon"}
										aria-label="קפוץ לסוף"
									>
										<IconPlayerSkipForward size={18} aria-hidden="true" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">קפוץ לסוף</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										data-easter-egg="play-btn"
										onClick={() => {
											if (playing) {
												return handlePause();
											}
											handlePlay();
										}}
										variant={"ghost"}
										size={"icon"}
										aria-label={playing ? "השהה" : "נגן"}
									>
										{playing ? (
											<IconPlayerPauseFilled size={18} aria-hidden="true" />
										) : (
											<IconPlayerPlayFilled size={18} aria-hidden="true" />
										)}
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">נגן / השהה</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										className="hidden md:inline-flex"
										onClick={doActiveDelete}
										variant={"ghost"}
										size={"icon"}
										aria-label="קפוץ להתחלה"
									>
										<IconPlayerSkipBack size={18} aria-hidden="true" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">קפוץ להתחלה</TooltipContent>
							</Tooltip>
						</div>
					</div>

					<ZoomControl scale={scale} onChangeTimelineScale={changeScale} duration={duration} />
				</div>
			</div>
		</div>
	);
};

const ZoomControl = ({
	scale,
	onChangeTimelineScale,
	duration,
}: {
	scale: ITimelineScaleState;
	onChangeTimelineScale: (scale: ITimelineScaleState) => void;
	duration: number;
}) => {
	const [localValue, setLocalValue] = useState(scale.index);
	const timelineOffsetX = useTimelineOffsetX();
	const prevDuration = useRef(duration);
	const scaleRef = useRef(scale);
	scaleRef.current = scale;
	const timelineOffsetXRef = useRef(timelineOffsetX);
	timelineOffsetXRef.current = timelineOffsetX;
	const onChangeRef = useRef(onChangeTimelineScale);
	onChangeRef.current = onChangeTimelineScale;

	useEffect(() => {
		setLocalValue(scale.index);
	}, [scale.index]);

	useEffect(() => {
		if (duration > prevDuration.current) {
			const fitZoom = getFitZoomLevel(duration, scaleRef.current.zoom, timelineOffsetXRef.current);
			onChangeRef.current(fitZoom);
		}
		prevDuration.current = duration;
	}, [duration]);

	const onZoomOutClick = () => {
		const previousZoom = getPreviousZoomLevel(scale);
		onChangeTimelineScale(previousZoom);
	};

	const onZoomInClick = () => {
		const nextZoom = getNextZoomLevel(scale);
		onChangeTimelineScale(nextZoom);
	};

	const onZoomFitClick = () => {
		const fitZoom = getFitZoomLevel(duration, scale.zoom, timelineOffsetX);
		onChangeTimelineScale(fitZoom);
	};

	return (
		<div className="flex items-center justify-end">
			<div className="flex lg:border-l pl-4 pr-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							size={"icon"}
							variant={"ghost"}
							onClick={onZoomOutClick}
							aria-label="הקטן תצוגה"
						>
							<ZoomOut size={18} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">הקטן תצוגה</TooltipContent>
				</Tooltip>
				<Slider
					className="w-28 hidden md:flex"
					value={[localValue]}
					min={0}
					max={12}
					step={1}
					onValueChange={(e) => {
						setLocalValue(e[0]); // Update local state
					}}
					onValueCommit={() => {
						const zoom = getZoomByIndex(localValue);
						onChangeTimelineScale(zoom); // Propagate value to parent when user commits change
					}}
				/>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button size={"icon"} variant={"ghost"} onClick={onZoomInClick} aria-label="הגדל תצוגה">
							<ZoomIn size={18} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">הגדל תצוגה</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							onClick={onZoomFitClick}
							variant={"ghost"}
							size={"icon"}
							aria-label="התאם לחלון"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="18" viewBox="0 0 24 24">
								<path
									fill="currentColor"
									d="M20 8V6h-2q-.425 0-.712-.288T17 5t.288-.712T18 4h2q.825 0 1.413.588T22 6v2q0 .425-.288.713T21 9t-.712-.288T20 8M2 8V6q0-.825.588-1.412T4 4h2q.425 0 .713.288T7 5t-.288.713T6 6H4v2q0 .425-.288.713T3 9t-.712-.288T2 8m18 12h-2q-.425 0-.712-.288T17 19t.288-.712T18 18h2v-2q0-.425.288-.712T21 15t.713.288T22 16v2q0 .825-.587 1.413T20 20M4 20q-.825 0-1.412-.587T2 18v-2q0-.425.288-.712T3 15t.713.288T4 16v2h2q.425 0 .713.288T7 19t-.288.713T6 20zm2-6v-4q0-.825.588-1.412T8 8h8q.825 0 1.413.588T18 10v4q0 .825-.587 1.413T16 16H8q-.825 0-1.412-.587T6 14"
								/>
							</svg>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">התאם לחלון</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
};

export default Header;
