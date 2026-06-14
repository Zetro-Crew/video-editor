import { dispatch } from "@designcombo/events";
import type StateManager from "@designcombo/state";
import { HISTORY_REDO, HISTORY_UNDO } from "@designcombo/state";
import { generateId } from "@designcombo/timeline";
import type { IDesign } from "@designcombo/types";
import { debounce } from "lodash-es";
import { Frame, Keyboard } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Icons } from "@/components/shared/icons";

import AutosizeInput from "@/components/ui/autosize-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import useCompositionStore from "@/features/editor/store/use-composition-store";
import { useIsLargeScreen, useIsSmallScreen } from "@/hooks/use-media-query";
import DownloadProgressModal from "./download-progress-modal";
import { clearProject } from "./external-preview/payload-intake";
import { useDownloadState } from "./store/use-download-state";

const MIN_CANVAS_SIZE = 64;
const MAX_CANVAS_SIZE = 4096;

const ProjectActionsBar = ({ stateManager }: { stateManager: StateManager }) => {
	const { actions } = useDownloadState();
	const { size } = useCompositionStore();

	const handleExport = () => {
		const data: IDesign = {
			id: generateId(),
			...stateManager.toJSON(),
			size,
		};

		const invalidCount = Object.values(
			(data.trackItemsMap as Record<string, unknown>) ?? {},
		).filter(
			(item) =>
				!Number.isFinite((item as { display?: { from?: number; to?: number } }).display?.from) ||
				!Number.isFinite((item as { display?: { from?: number; to?: number } }).display?.to),
		).length;

		if (invalidCount > 0) {
			toast.error(
				`${invalidCount} פריט${invalidCount > 1 ? "ים" : ""} עם תזמון שגוי — הסר והוסף מחדש לפני הייצוא.`,
			);
			return;
		}

		actions.setPayload(data);
		actions.setDisplayProgressModal(true);
	};

	return (
		<>
			<div aria-hidden="true" className="self-stretch w-px bg-border/60 mx-1" />
						<button
				type="button"
				onClick={() => clearProject(stateManager)}
				className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
			>
				איפוס סרטון
			</button>
			<button
				type="button"
				onClick={handleExport}
				className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
			>
				הפקת סרטון
			</button>
		</>
	);
};

export default function Navbar({
	stateManager,
	setProjectName,
	projectName,
	onOpenShortcuts,
}: {
	stateManager: StateManager;
	setProjectName: (name: string) => void;
	projectName: string;
	onOpenShortcuts: () => void;
}) {
	const [title, setTitle] = useState(projectName);
	const isLargeScreen = useIsLargeScreen();
	const isSmallScreen = useIsSmallScreen();
	const { size, setSize } = useCompositionStore();
	const [canvasWidth, setCanvasWidth] = useState(String(size.width));
	const [canvasHeight, setCanvasHeight] = useState(String(size.height));

	const handleUndo = () => {
		dispatch(HISTORY_UNDO);
	};

	const handleRedo = () => {
		dispatch(HISTORY_REDO);
	};

	// Create a debounced function for setting the project name
	const debouncedSetProjectName = useCallback(
		debounce((name: string) => {
			setProjectName(name);
		}, 2000), // 2 seconds delay
		[],
	);

	// Update the debounced function whenever the title changes
	useEffect(() => {
		debouncedSetProjectName(title);
	}, [title, debouncedSetProjectName]);

	useEffect(() => {
		setCanvasWidth(String(size.width));
		setCanvasHeight(String(size.height));
	}, [size.width, size.height]);

	const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setTitle(e.target.value);
	};

	const applyCanvasSize = (nextWidth: number, nextHeight: number) => {
		setSize({
			width: nextWidth,
			height: nextHeight,
		});
	};

	const handleCanvasSizeSubmit = () => {
		const parsedWidth = Number.parseInt(canvasWidth, 10);
		const parsedHeight = Number.parseInt(canvasHeight, 10);
		if (
			Number.isNaN(parsedWidth) ||
			Number.isNaN(parsedHeight) ||
			parsedWidth < MIN_CANVAS_SIZE ||
			parsedHeight < MIN_CANVAS_SIZE
		) {
			setCanvasWidth(String(size.width));
			setCanvasHeight(String(size.height));
			return;
		}

		applyCanvasSize(
			Math.min(parsedWidth, MAX_CANVAS_SIZE),
			Math.min(parsedHeight, MAX_CANVAS_SIZE),
		);
	};

	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: isLargeScreen ? "320px 1fr 320px" : "1fr 1fr 1fr",
			}}
			className="bg-card pointer-events-none flex h-13 items-center border-b border-border/80 px-2"
		>
			<DownloadProgressModal stateManager={stateManager} />

			<div className="flex items-center gap-2">
				<div className=" pointer-events-auto flex h-10 items-center px-1.5">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={handleUndo}
								aria-label="בטל פעולה"
								className="text-muted-foreground"
								variant="ghost"
								size="icon"
							>
								<Icons.undo width={20} aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">בטל פעולה</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={handleRedo}
								aria-label="בצע שוב"
								className="text-muted-foreground"
								variant="ghost"
								size="icon"
							>
								<Icons.redo width={20} aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">בצע שוב</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={onOpenShortcuts}
								aria-label="קיצורי דרך"
								className="text-muted-foreground"
								variant="ghost"
								size="icon"
							>
								<Keyboard width={20} aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">קיצורי דרך</TooltipContent>
					</Tooltip>
				</div>
			</div>

			<div className="flex h-13 items-center justify-center gap-2">
				{!isSmallScreen && (
					<div
						data-roni-cut
						className=" pointer-events-auto flex h-10 items-center gap-2 rounded-md px-2.5"
					>
						<AutosizeInput
							name="title"
							aria-label="שם פרויקט"
							value={title}
							onChange={handleTitleChange}
							width={200}
							inputClassName="border-none outline-none px-1 text-sm font-medium"
						/>
					</div>
				)}
			</div>

			<div className="flex h-13 items-center justify-end gap-2">
				<div className=" pointer-events-auto flex h-10 items-center gap-2 rounded-md px-2.5">
					<CanvasSizePopover
						canvasHeight={canvasHeight}
						canvasWidth={canvasWidth}
						onApply={handleCanvasSizeSubmit}
						onCanvasHeightChange={setCanvasHeight}
						onCanvasWidthChange={setCanvasWidth}
					/>
					<ProjectActionsBar stateManager={stateManager} />
				</div>
			</div>
		</div>
	);
}

const CanvasSizePopover = ({
	canvasHeight,
	canvasWidth,
	onApply,
	onCanvasHeightChange,
	onCanvasWidthChange,
}: {
	canvasHeight: string;
	canvasWidth: string;
	onApply: () => void;
	onCanvasHeightChange: (value: string) => void;
	onCanvasWidthChange: (value: string) => void;
}) => {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							className="h-8 w-8 rounded-full border border-border"
							variant="outline"
							size="icon"
							aria-label="קנבס"
						>
							<Frame size={16} aria-hidden="true" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">שנה גודל קנבס</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className="bg-sidebar z-[250] flex w-72 flex-col gap-4">
				<div className="space-y-1">
					<Label>גודל קנבס</Label>
					<p className="text-muted-foreground text-xs">עדכן את רזולוציית העורך והייצוא.</p>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1">
						<Label htmlFor="canvas-width">רוחב</Label>
						<Input
							id="canvas-width"
							min={MIN_CANVAS_SIZE}
							max={MAX_CANVAS_SIZE}
							step={1}
							type="number"
							value={canvasWidth}
							onChange={(e) => onCanvasWidthChange(e.target.value)}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="canvas-height">גובה</Label>
						<Input
							id="canvas-height"
							min={MIN_CANVAS_SIZE}
							max={MAX_CANVAS_SIZE}
							step={1}
							type="number"
							value={canvasHeight}
							onChange={(e) => onCanvasHeightChange(e.target.value)}
						/>
					</div>
				</div>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button onClick={onApply}>החל</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">החל שינויי גודל</TooltipContent>
				</Tooltip>
			</PopoverContent>
		</Popover>
	);
};
