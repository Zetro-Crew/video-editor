import { create } from "zustand";
import type { ILayoutState } from "../interfaces/layout";

const useLayoutStore = create<ILayoutState>((set) => ({
	activeMenuItem: "texts",
	showMenuItem: false,
	cropTarget: null,
	showControlItem: false,
	showToolboxItem: false,
	activeToolboxItem: null,
	floatingControl: null,
	drawerOpen: false,
	controItemDrawerOpen: false,
	typeControlItem: "",
	labelControlItem: "",
	isFullScreen: false,
	viewTimeline: true,
	controlItemOpen: false,
	setCropTarget: (cropTarget) => set({ cropTarget }),
	setIsFullScreen: (isFullScreen) => set({ isFullScreen }),
	setActiveMenuItem: (showMenu) => set({ activeMenuItem: showMenu }),
	setShowMenuItem: (showMenuItem) => set({ showMenuItem }),
	setShowControlItem: (showControlItem) => set({ showControlItem }),
	setShowToolboxItem: (showToolboxItem) => set({ showToolboxItem }),
	setActiveToolboxItem: (activeToolboxItem) => set({ activeToolboxItem }),
	setFloatingControl: (floatingControl) => set({ floatingControl }),
	setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
	setControItemDrawerOpen: (controItemDrawerOpen) => set({ controItemDrawerOpen }),
	setTypeControlItem: (typeControlItem) => set({ typeControlItem }),
	setLabelControlItem: (labelControlItem) => set({ labelControlItem }),
	setViewTimeline: (viewTimeline) => set({ viewTimeline }),
	setControlItemOpen: (controlItemOpen) => set({ controlItemOpen }),
}));

export default useLayoutStore;
