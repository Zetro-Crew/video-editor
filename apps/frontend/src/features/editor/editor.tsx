import { dispatch } from "@designcombo/events";
import StateManager, { ADD_SHAPE, ADD_TEXT } from "@designcombo/state";
import { generateId } from "@designcombo/timeline";
import type { ITrackItem } from "@designcombo/types";
import { Circle, MoveUpRight, Square, Triangle, Upload } from "lucide-react";
import { nanoid } from "nanoid";
import { memo, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { SECONDARY_FONT, SECONDARY_FONT_URL } from "./constants/constants";
import { TEXT_ADD_PAYLOAD } from "./constants/payload";
import { ControlItem } from "./control-item/control-item";
import CropModal from "./crop-modal/crop-modal";
import { useEditorPostMessage } from "./external-preview/use-editor-post-message";
import useEasterEggs from "./hooks/use-easter-eggs";
import useKeyboardShortcuts from "./hooks/use-keyboard-shortcuts";
import useTimelineEvents from "./hooks/use-timeline-events";
import Navbar from "./navbar";
import Scene from "./scene/scene";
import type { SceneRef } from "./scene/scene.types";
import { ShortcutsModal } from "./shortcuts-modal";
import { useActiveItem } from "./store/selectors";
import useCompositionStore from "./store/use-composition-store";
import useEditorRefs from "./store/use-editor-refs";
import useLayoutStore from "./store/use-layout-store";
import useUploadStore from "./store/use-upload-store";
import Timeline from "./timeline/timeline";
import { loadFonts } from "./utils/fonts";

const svgToDataUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(svg)}`;

const SHAPES_DIRECT = [
	{
		id: "square",
		label: "ריבוע",
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="3" y="3" width="94" height="94" rx="6" fill="none" stroke="white" stroke-width="6"/></svg>`,
		width: 80,
		height: 80,
		icon: (
			<Square size={18} />
			// <svg
			// 	viewBox="0 0 100 100"
			// 	width="18"
			// 	height="18"
			// 	fill="none"
			// 	stroke="currentColor"
			// 	strokeWidth="7"
			// >
			// 	<rect x="3" y="3" width="94" height="94" rx="6" />
			// </svg>
		),
	},
	{
		id: "circle",
		label: "עיגול",
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="white" stroke-width="6"/></svg>`,
		width: 80,
		height: 80,
		icon: (
			<Circle size={18} />
			// <svg
			// 	viewBox="0 0 100 100"
			// 	width="18"
			// 	height="18"
			// 	fill="none"
			// 	stroke="currentColor"
			// 	strokeWidth="7"
			// >
			// 	<circle cx="50" cy="50" r="44" />
			// </svg>
		),
	},
	{
		id: "arrow",
		label: "חץ",
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><polygon points="2,18 58,18 58,3 98,30 58,57 58,42 2,42" fill="none" stroke="white" stroke-width="5" stroke-linejoin="round"/></svg>`,
		width: 120,
		height: 72,
		icon: (
			<MoveUpRight size={22} />

			// <svg
			// 	viewBox="0 0 100 60"
			// 	width="18"
			// 	height="18"
			// 	fill="none"
			// 	stroke="currentColor"
			// 	strokeWidth="6"
			// 	strokeLinejoin="round"
			// >
			// 	<polygon points="2,18 58,18 58,3 98,30 58,57 58,42 2,42" />
			// </svg>
		),
	},
	{
		id: "triangle",
		label: "משולש",
		svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,4 97,96 3,96" fill="none" stroke="white" stroke-width="6" stroke-linejoin="round"/></svg>`,
		width: 80,
		height: 80,
		icon: (
			<Triangle size={18} />
			// <svg
			// 	viewBox="0 0 100 100"
			// 	width="18"
			// 	height="18"
			// 	fill="none"
			// 	stroke="currentColor"
			// 	strokeWidth="7"
			// 	strokeLinejoin="round"
			// >
			// 	<polygon points="50,4 97,96 3,96" />
			// </svg>
		),
	},
].map((s) => ({ ...s, dataUrl: svgToDataUrl(s.svg) }));

const addShape = (shape: (typeof SHAPES_DIRECT)[0]) => {
	const { size } = useCompositionStore.getState();
	const left = Math.round(size.width / 2 - shape.width / 2);
	const top = Math.round(size.height / 2 - shape.height / 2);

	dispatch(ADD_SHAPE, {
		payload: {
			id: generateId(),
			type: "shape",
			display: { from: 0, to: 5000 },
			details: {
				src: shape.dataUrl,
				path: "",
				width: shape.width,
				height: shape.height,
				backgroundColor: "transparent",
				borderColor: "#ffffff",
				borderWidth: 1,
				borderRadius: 0,
				opacity: 100,
				transform: "",
				border: "",
				top: `${top}px`,
				left: `${left}px`,
				flipX: false,
				flipY: false,
				rotate: "0deg",
				visibility: "visible" as const,
			},
			metadata: {},
		},
		options: {},
	});
};

const addText = () => {
	dispatch(ADD_TEXT, {
		payload: { ...TEXT_ADD_PAYLOAD, id: nanoid() },
		options: {},
	});
};

const RightSideMenu = () => {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { addPendingUploads, processUploads } = useUploadStore();

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files ?? []);
		if (files.length === 0) return;
		addPendingUploads(
			files.map((file) => ({
				id: nanoid(),
				file,
				type: file.type,
				status: "pending" as const,
			})),
		);
		processUploads();
		e.target.value = "";
	};

	return (
		<div className="absolute right-2 top-2 z-[60] flex flex-col items-center gap-1">
			<span className="text-s font-medium text-muted-foreground">כלים</span>
			<div className="flex flex-col gap-1.5 p-2 bg-card border border-border/80 rounded-xl shadow-lg">
				<input
					ref={fileInputRef}
					type="file"
					multiple
					accept="video/*,image/*,audio/*"
					className="hidden"
					aria-label="בחר קבצי מדיה"
					onChange={handleFileChange}
				/>
				<button
					type="button"
					aria-label="טקסט"
					onClick={addText}
					className="flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150 text-muted-foreground hover:bg-secondary hover:text-foreground font-bold text-lg"
				>
					T
				</button>
				<div className="flex flex-col gap-0.5">
					{SHAPES_DIRECT.map((shape) => (
						<button
							key={shape.id}
							type="button"
							aria-label={shape.label}
							onClick={() => addShape(shape)}
							className="flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150 text-muted-foreground hover:bg-secondary hover:text-foreground"
						>
							{shape.icon}
						</button>
					))}
				</div>
				<button
					type="button"
					aria-label="העלאה"
					onClick={() => fileInputRef.current?.click()}
					className="flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150 text-muted-foreground hover:bg-secondary hover:text-foreground"
				>
					<Upload size={18} />
				</button>
			</div>
		</div>
	);
};

const stateManager = new StateManager({
	size: {
		width: 1920,
		height: 1080,
	},
});

if (import.meta.env.DEV) {
	(window as Window & { __editorStateManager?: typeof stateManager }).__editorStateManager =
		stateManager;
}

interface SceneContainerProps {
	sceneRef: React.RefObject<SceneRef | null>;
	stateManager: StateManager;
	trackItem: ITrackItem | null;
}

const SceneContainer = memo(({ sceneRef, stateManager, trackItem }: SceneContainerProps) => {
	return (
		<div dir="ltr" className="relative flex h-full w-full flex-col bg-background">
			<div className="flex-1 relative overflow-hidden w-full h-full">
				<div className="flex h-full flex-1">
					<div className="flex-1 relative overflow-hidden w-full h-full">
						<CropModal />
						<Scene ref={sceneRef} stateManager={stateManager} />
					</div>
				</div>
				{!trackItem ? <RightSideMenu /> : null}
			</div>
		</div>
	);
});

const Editor = ({ tempId, id }: { tempId?: string; id?: string }) => {
	const [projectName, setProjectName] = useState<string>("Ztube Editor");
	const sceneRef = useRef<SceneRef>(null);
	const { timeline, playerRef } = useEditorRefs(
		useShallow((s) => ({ timeline: s.timeline, playerRef: s.playerRef })),
	);
	const trackItem = useActiveItem();
	const { controlItemOpen, showMenuItem } = useLayoutStore(
		useShallow((s) => ({ controlItemOpen: s.controlItemOpen, showMenuItem: s.showMenuItem })),
	);
	const showPanel = showMenuItem || (!!trackItem && controlItemOpen);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);

	useTimelineEvents();
	useKeyboardShortcuts();
	useEasterEggs();
	useEditorPostMessage(stateManager);

	useEffect(() => {
		loadFonts([
			{
				name: SECONDARY_FONT,
				url: SECONDARY_FONT_URL,
			},
		]);
	}, []);

	const handleTimelineResize = () => {
		const timelineContainer = document.getElementById("timeline-container");
		if (!timelineContainer) return;

		timeline?.resize(
			{
				height: timelineContainer.clientHeight - 90,
				width: timelineContainer.clientWidth - 40,
			},
			{
				force: true,
			},
		);

		setTimeout(() => {
			sceneRef.current?.recalculateZoom();
		}, 100);
	};

	useEffect(() => {
		const onResize = () => handleTimelineResize();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [timeline]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			const isEditable =
				target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

			if (e.key === "?") {
				if (isEditable) return;
				setShortcutsOpen((prev) => !prev);
				return;
			}

			if (e.key !== "t" && e.key !== "T") return;
			if (isEditable) return;
			addText();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	useEffect(() => {
		document.title = projectName || "Ztube Editor";
		return () => {
			document.title = "Ztube Editor";
		};
	}, [projectName]);

	return (
		<div dir="rtl" className="flex h-screen w-screen flex-col">
			<ShortcutsModal open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
			<a
				href="#editor-main"
				className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-[9999] focus:rounded focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2"
			>
				דלג לתוכן
			</a>
			<header>
				<Navbar
					projectName={projectName}
					stateManager={stateManager}
					setProjectName={setProjectName}
					onOpenShortcuts={() => setShortcutsOpen(true)}
				/>
			</header>

			<main id="editor-main" tabIndex={-1} className="flex flex-col flex-1 min-h-0 outline-none">
				<div className="flex flex-1 min-h-0">
					<div className="flex-1 min-w-0 h-full">
						<SceneContainer sceneRef={sceneRef} stateManager={stateManager} trackItem={trackItem} />
					</div>
					<aside
						aria-label="לוח בקרה"
						className={`shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out ${showPanel ? "w-96" : "w-0"}`}
					>
						<ControlItem />
					</aside>
				</div>
				<div className="w-full shrink-0">
					{playerRef ? <Timeline stateManager={stateManager} /> : null}
				</div>
			</main>
		</div>
	);
};

export default Editor;
