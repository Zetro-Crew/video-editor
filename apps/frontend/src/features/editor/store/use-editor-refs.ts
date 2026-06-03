import type Timeline from "@designcombo/timeline";
import type { Moveable } from "@interactify/toolkit";
import type { PlayerRef } from "@remotion/player";
import { create } from "zustand";

interface IEditorRefsStore {
	playerRef: React.RefObject<PlayerRef> | null;
	sceneMoveableRef: React.RefObject<Moveable> | null;
	timeline: Timeline | null;
	setPlayerRef: (ref: React.RefObject<PlayerRef> | null) => void;
	setSceneMoveableRef: (ref: React.RefObject<Moveable> | null) => void;
	setTimeline: (timeline: Timeline | null) => void;
}

const useEditorRefs = create<IEditorRefsStore>((set) => ({
	playerRef: null,
	sceneMoveableRef: null,
	timeline: null,
	setPlayerRef: (playerRef) => set({ playerRef }),
	setSceneMoveableRef: (sceneMoveableRef) => set({ sceneMoveableRef }),
	setTimeline: (timeline) => set({ timeline }),
}));

export default useEditorRefs;
