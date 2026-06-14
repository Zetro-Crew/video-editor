import { dispatch } from "@designcombo/events";
import {
	ACTIVE_SPLIT,
	LAYER_CLONE,
	LAYER_DELETE,
	TIMELINE_SCALE_CHANGED,
} from "@designcombo/state";
import type Timeline from "@designcombo/timeline";
import type { IAudio, ITimelineScaleState, ITrack, ITrackItem } from "@designcombo/types";
import { CopyPlus, SquareSplitHorizontal, Trash, Volume2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMediumScreen } from "@/hooks/use-media-query";
import { PLAYER_PAUSE, PLAYER_PLAY } from "../constants/events";
import Speed from "../control-item/common/speed";
import Volume from "../control-item/common/volume";
import { useCurrentPlayerFrame } from "../hooks/use-current-frame";
import { useTimelineOffsetX } from "../hooks/use-timeline-offset";
import { useTrackItemEditor } from "../hooks/use-track-item-editor";
import useUpdateAnsestors from "../hooks/use-update-ansestors";
import { useActiveItem, useHasSelection } from "../store/selectors";
import useCompositionStore from "../store/use-composition-store";
import useEditorRefs from "../store/use-editor-refs";
import useTimelineViewStore from "../store/use-timeline-view-store";
import { frameToTimeString, getCurrentTime, timeToString } from "../utils/time";
import {
	getFitZoomLevel,
	getNextZoomLevel,
	getPreviousZoomLevel,
	getZoomByIndex,
} from "../utils/timeline";

const VIDEO_TRACK_TYPES = new Set<string>([
	"video",
	"image",
	"shape",
	"text",
	"caption",
	"illustration",
	"main",
	"template",
	"composition",
]);
// waveAudioBars and hillAudioBars are not in ITrackType but can appear at runtime.
const AUDIO_ALL_TYPES = new Set<string>([
	"audio",
	"radialAudioBars",
	"linealAudioBars",
	"waveAudioBars",
	"hillAudioBars",
]);

type CanvasObj = { id?: string; visible: boolean };
type HiddenGroupState = { tracks: ITrack[]; itemIds: Set<string> };

// Each track row is preceded by a 30px top-helper (bottom of the -970 helper) and separated from
// the next by an 8px center-helper. This matches renderTracks() in @designcombo/timeline.
const TRACKS_Y_OFFSET = 30;
const TRACK_HELPER_SPACING = 8;

const computeTracksHeight = (tracks: ITrack[], timeline: Timeline): number => {
	if (tracks.length === 0) return TRACKS_Y_OFFSET;
	return (
		TRACKS_Y_OFFSET +
		tracks.reduce((sum, t) => sum + timeline.getItemSize(t.type), 0) +
		(tracks.length - 1) * TRACK_HELPER_SPACING
	);
};

const applyTimelineLayout = (timeline: Timeline) => {
	// canvas.resize() must NOT be called here. The canvas viewport height is fixed to
	// the container's visible area; it must only change when the container is physically
	// resized. Growing the canvas to content height (a previous approach) made internal
	// vertical scroll impossible (viewport = content) and caused DOM overflow clipping.
	//
	// renderTracks() / requestRenderAll() may reset the canvas viewport (horizontal
	// scroll position) without firing onViewportChange. Capture the current position
	// from viewportTransform before the layout operations, then restore it one RAF
	// frame later — after the library's own requestRenderAll() RAF has settled.
	const vt = (timeline as unknown as { viewportTransform: number[] }).viewportTransform;
	const scrollLeftBefore = vt ? Math.max(0, 16 - vt[4]) : 0;

	timeline.renderTracks();
	timeline.alignItemsToTrack();
	timeline.requestRenderAll();

	// Clamp vertical scroll to the new content bounds. When tracks are hidden the
	// content shrinks; without clamping the view stays scrolled into empty space.
	const contentHeight = computeTracksHeight(timeline.tracks, timeline);
	const canvasHeight = (timeline as unknown as { height: number }).height;
	const currentScrollTop = vt ? Math.max(0, -vt[5]) : 0;
	const maxScrollTop = Math.max(0, contentHeight - canvasHeight);
	if (currentScrollTop > maxScrollTop) {
		timeline.scrollTo({ scrollTop: maxScrollTop });
	}

	requestAnimationFrame(() => {
		timeline.scrollTo({ scrollLeft: scrollLeftBefore });
	});
};

const setTrackGroupVisible = (
	timeline: Timeline,
	isVideoGroup: boolean,
	visible: boolean,
	hiddenRef: React.MutableRefObject<{ video: HiddenGroupState; audio: HiddenGroupState }>,
) => {
	const group = isVideoGroup ? "video" : "audio";
	const typeSet = isVideoGroup ? VIDEO_TRACK_TYPES : AUDIO_ALL_TYPES;
	const isAffected = (type: string) => typeSet.has(type);
	const objects = timeline.getObjects() as unknown as CanvasObj[];

	if (!visible) {
		const affectedTracks = timeline.tracks.filter((t) => isAffected(t.type));
		const affectedItemIds = new Set(affectedTracks.flatMap((t) => t.items));
		hiddenRef.current[group] = { tracks: affectedTracks, itemIds: affectedItemIds };
		timeline.tracks = timeline.tracks.filter((t) => !isAffected(t.type));

		// Clear selection before hiding objects. The canvas library keeps an internal
		// "active object" pointer that is independent of obj.visible. If an item from
		// this group is selected when it becomes invisible, the library still draws its
		// handles on the next renderAll, creating orphaned floating handles.
		//
		// Use the Zustand store as the reliable source (it mirrors canvas selection via
		// LAYER_SELECTION events). If any selected ID belongs to this group, clear both
		// the canvas-level selection and the Zustand state. discardActiveObject alone
		// is not sufficient because the library may not re-dispatch selection:cleared
		// as a LAYER_SELECTION event through the @designcombo/events subject.
		const currentActiveIds = useCompositionStore.getState().activeIds;
		const hasAffectedActive = currentActiveIds.some((id) => affectedItemIds.has(id));
		if (hasAffectedActive) {
			(timeline as unknown as { discardActiveObject: () => void }).discardActiveObject?.();
			useCompositionStore.setState({ activeIds: [] });
		}

		for (const obj of objects) {
			if (obj.id && affectedItemIds.has(obj.id)) obj.visible = false;
		}
	} else {
		const { tracks: savedTracks, itemIds: savedItemIds } = hiddenRef.current[group];
		hiddenRef.current[group] = { tracks: [], itemIds: new Set() };
		// Video tracks go first (top), audio tracks go last (bottom)
		timeline.tracks = isVideoGroup
			? [...savedTracks, ...timeline.tracks]
			: [...timeline.tracks, ...savedTracks];
		for (const obj of objects) {
			if (obj.id && savedItemIds.has(obj.id)) obj.visible = true;
		}
	}

	applyTimelineLayout(timeline);
};

const AudioTrackControls = ({ trackItem }: { trackItem: ITrackItem & IAudio }) => {
	const { properties, update } = useTrackItemEditor(trackItem);
	return (
		<div className="space-y-4">
			<p className="text-sm font-medium text-center">סאונד</p>
			<Volume
				value={(properties.details as { volume?: number }).volume ?? 100}
				onChange={(v) => update({ details: { volume: v } })}
			/>
			<Speed value={properties.playbackRate ?? 1} onChange={(v) => update({ playbackRate: v })} />
		</div>
	);
};

const TrackCheckmark = () => (
	<svg viewBox="0 0 10 10" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5">
		<polyline points="2,5 4,7 8,3" />
	</svg>
);

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
	const storeTracks = useCompositionStore((s) => s.tracks);
	const { scale, showVideoTracks, showAudioTracks, setShowVideoTracks, setShowAudioTracks } =
		useTimelineViewStore();
	const { playerRef, timeline } = useEditorRefs();
	const activeItem = useActiveItem();
	const hiddenRef = useRef<{ video: HiddenGroupState; audio: HiddenGroupState }>({
		video: { tracks: [], itemIds: new Set() },
		audio: { tracks: [], itemIds: new Set() },
	});

	const hasVideoTracks = storeTracks.some((t) => VIDEO_TRACK_TYPES.has(t.type));
	const hasAudioTracks = storeTracks.some((t) => AUDIO_ALL_TYPES.has(t.type));
	const activeAudioItem =
		activeItem && AUDIO_ALL_TYPES.has(activeItem.type) ? (activeItem as ITrackItem & IAudio) : null;

	const prevHasVideoRef = useRef(hasVideoTracks);
	const prevHasAudioRef = useRef(hasAudioTracks);

	// When new content of a hidden type appears, auto-reveal it and clear stale hiddenRef data.
	useEffect(() => {
		const prev = prevHasVideoRef.current;
		prevHasVideoRef.current = hasVideoTracks;
		if (!prev && hasVideoTracks && !showVideoTracks && timeline) {
			setShowVideoTracks(true);
			hiddenRef.current.video = { tracks: [], itemIds: new Set() };
			applyTimelineLayout(timeline);
		}
	}, [hasVideoTracks]);

	useEffect(() => {
		const prev = prevHasAudioRef.current;
		prevHasAudioRef.current = hasAudioTracks;
		if (!prev && hasAudioTracks && !showAudioTracks && timeline) {
			setShowAudioTracks(true);
			hiddenRef.current.audio = { tracks: [], itemIds: new Set() };
			applyTimelineLayout(timeline);
		}
	}, [hasAudioTracks]);

	const handleToggleVideo = () => {
		if (!hasVideoTracks) return;
		const next = !showVideoTracks;
		setShowVideoTracks(next);
		if (timeline) setTrackGroupVisible(timeline, true, next, hiddenRef);
	};

	const handleToggleAudio = () => {
		if (!hasAudioTracks) return;
		const next = !showAudioTracks;
		setShowAudioTracks(next);
		if (timeline) setTrackGroupVisible(timeline, false, next, hiddenRef);
	};
	const hasSelection = useHasSelection();
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
				height: "40px",
				flex: "none",
			}}
		>
			<div
				style={{
					position: "relative",
					height: 40,
					width: "100%",
					display: "grid",
					gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
					alignItems: "center",
				}}
			>
				{/* col-1 → visual RIGHT in RTL.
				    RTL flex order (first DOM = rightmost visual):
				      1. ZoomControl  ← absolute right edge
				      2. Divider (explicit element, hidden on mobile)
				      3. וידאו toggle
				      4. שמע toggle  ← leftmost of this group (nearest to center) */}
				<div className="flex items-center min-w-0 overflow-hidden">
					<ZoomControl scale={scale} onChangeTimelineScale={changeScale} duration={duration} />
					{/* Vertical divider between zoom control and toggles */}
					<div aria-hidden="true" className="hidden md:block self-stretch w-px bg-border/60 mx-2" />
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={handleToggleVideo}
								aria-label="הצג/הסתר רצועות וידאו"
								disabled={!hasVideoTracks}
								className={`hidden md:flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors ${!hasVideoTracks ? "opacity-30 cursor-not-allowed" : showVideoTracks ? "text-foreground" : "text-muted-foreground/40"}`}
							>
								<span
									className={`size-3 rounded-sm border flex items-center justify-center ${!hasVideoTracks ? "border-muted-foreground/30" : showVideoTracks ? "border-foreground bg-foreground/20" : "border-muted-foreground/40"}`}
								>
									{hasVideoTracks && showVideoTracks && <TrackCheckmark />}
								</span>
								<span>וידאו</span>
							</button>
						</TooltipTrigger>
						<TooltipContent side="top">הצג/הסתר רצועות וידאו</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={handleToggleAudio}
								aria-label="הצג/הסתר רצועות שמע"
								disabled={!hasAudioTracks}
								className={`hidden md:flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors ${!hasAudioTracks ? "opacity-30 cursor-not-allowed" : showAudioTracks ? "text-foreground" : "text-muted-foreground/40"}`}
							>
								<span
									className={`size-3 rounded-sm border flex items-center justify-center ${!hasAudioTracks ? "border-muted-foreground/30" : showAudioTracks ? "border-foreground bg-foreground/20" : "border-muted-foreground/40"}`}
								>
									{hasAudioTracks && showAudioTracks && <TrackCheckmark />}
								</span>
								<span>שמע</span>
							</button>
						</TooltipTrigger>
						<TooltipContent side="top">הצג/הסתר רצועות שמע</TooltipContent>
					</Tooltip>
				</div>

				{/* CENTER: time display + player buttons in one row */}
				<div className="flex items-center justify-center gap-1 pointer-events-auto">
					<div className="hidden md:flex items-center tabular-nums gap-1 text-xs text-muted-foreground">
						<span>{timeToString({ time: duration })}</span>
						<span className="px-0.5">|</span>
						<span
							className="font-medium text-foreground"
							data-current-time={currentFrame / fps}
							id="video-current-time"
						>
							{frameToTimeString({ frame: currentFrame }, { fps })}
						</span>
					</div>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								className="hidden md:inline-flex"
								onClick={() => playerRef?.current?.seekTo(Math.round((duration * fps) / 1000))}
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
								onClick={() => (playing ? handlePause() : handlePlay())}
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
								onClick={() => playerRef?.current?.seekTo(0)}
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

				{/* col-3 → visual LEFT in RTL.
				    A flex-1 spacer is the FIRST DOM child. In RTL flex, first = rightmost visual,
				    so the spacer grows to fill the gap between buttons and the center column.
				    Buttons land at the physical-left edge.
				    RTL flex order of buttons (first = rightmost):
				      1. שמע  ← rightmost of group (nearest to center)
				      2. שכפל
				      3. פצל
				      4. מחק   ← absolute left edge */}
				<div className="flex items-center min-w-0 overflow-hidden">
					{/* grow spacer: fills the right side (toward center) so buttons pin left */}
					<div aria-hidden="true" className="flex-1" />
					{activeAudioItem && (
						<Popover>
							<Tooltip>
								<TooltipTrigger asChild>
									<PopoverTrigger asChild>
										<Button
											variant={"ghost"}
											size={isLargeScreen ? "default" : "icon"}
											className="flex items-center gap-1.5 px-3"
											aria-label="הגדרות שמע ומהירות"
										>
											<Volume2 size={18} aria-hidden="true" />
											<span className="hidden lg:block text-sm font-medium">שמע</span>
										</Button>
									</PopoverTrigger>
								</TooltipTrigger>
								<TooltipContent side="top">עוצמת קול ומהירות</TooltipContent>
							</Tooltip>
							<PopoverContent side="top" className="w-64 p-4">
								<AudioTrackControls trackItem={activeAudioItem} />
							</PopoverContent>
						</Popover>
					)}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								disabled={!hasSelection}
								onClick={() => dispatch(LAYER_CLONE)}
								variant={"ghost"}
								size={isLargeScreen ? "default" : "icon"}
								className="flex items-center gap-1.5 px-3"
							>
								<CopyPlus size={18} aria-hidden="true" />
								<span className="hidden lg:block text-sm font-medium">שכפל</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top">שכפל שכבה</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								disabled={!hasSelection}
								onClick={doActiveSplit}
								variant={"ghost"}
								size={isLargeScreen ? "default" : "icon"}
								className="flex items-center gap-1.5 px-3"
							>
								<SquareSplitHorizontal size={18} aria-hidden="true" />
								<span className="hidden lg:block text-sm font-medium">פצל</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top">פצל בנקודת הסמן</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								disabled={!hasSelection}
								onClick={doActiveDelete}
								variant={"ghost"}
								size={isLargeScreen ? "default" : "icon"}
								className="flex items-center gap-1.5 px-3"
							>
								<Trash size={18} aria-hidden="true" />
								<span className="hidden lg:block text-sm font-medium">מחק</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top">מחק שכבה</TooltipContent>
					</Tooltip>
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
		<div className="flex items-center justify-start min-w-0" dir="ltr">
			<div className="flex ps-4 pe-2">
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
					className="w-28 hidden md:flex [&_[data-slot='slider-range']]:bg-red-400 [&_[data-slot='slider-thumb']]:border-red-400"
					value={[localValue]}
					min={0}
					max={12}
					step={1}
					onValueChange={(e) => {
						setLocalValue(e[0]);
					}}
					onValueCommit={() => {
						const zoom = getZoomByIndex(localValue);
						onChangeTimelineScale(zoom);
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
