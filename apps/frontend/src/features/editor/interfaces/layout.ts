import type { ITrackItem } from "@designcombo/types";

type IMenuItem =
	| "uploads"
	| "templates"
	| "shapes"
	| "audios"
	| "transitions"
	| "texts"
	| "elements";
export interface ILayoutState {
	cropTarget: ITrackItem | null;
	activeMenuItem: IMenuItem | null;
	showMenuItem: boolean;
	showControlItem: boolean;
	showToolboxItem: boolean;
	activeToolboxItem: string | null;
	floatingControl: any; // "font-family-picker" | "text-preset-picker"| "animation-picker"
	drawerOpen: boolean;
	controItemDrawerOpen: boolean;
	typeControlItem: string;
	labelControlItem: string;
	isFullScreen: boolean;
	viewTimeline: boolean;
	controlItemOpen: boolean;
	setCropTarget: (cropTarget: ITrackItem | null) => void;
	setIsFullScreen: (isFullScreen: boolean) => void;
	setActiveMenuItem: (showMenu: IMenuItem | null) => void;
	setShowMenuItem: (showMenuItem: boolean) => void;
	setShowControlItem: (showControlItem: boolean) => void;
	setShowToolboxItem: (showToolboxItem: boolean) => void;
	setActiveToolboxItem: (activeToolboxItem: string | null) => void;
	setFloatingControl: (floatingControl: any) => void;
	setDrawerOpen: (drawerOpen: boolean) => void;
	setControItemDrawerOpen: (controItemDrawerOpen: boolean) => void;
	setTypeControlItem: (typeControlItem: string) => void;
	setLabelControlItem: (labelControlItem: string) => void;
	setViewTimeline: (viewTimeline: boolean) => void;
	setControlItemOpen: (controlItemOpen: boolean) => void;
}
