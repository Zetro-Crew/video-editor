import type StateManager from "@designcombo/state";
import { forwardRef, lazy, Suspense, useImperativeHandle, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import useZoom from "../hooks/use-zoom";
import useCompositionStore from "../store/use-composition-store";
import Board from "./board";
import SceneEmpty from "./empty";
import { SceneInteractions } from "./interactions";
import type { SceneRef } from "./scene.types";

const Player = lazy(() => import("../player/player"));

const Scene = forwardRef<
	SceneRef,
	{
		stateManager: StateManager;
	}
>(({ stateManager }, ref) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const { size, trackItemIds } = useCompositionStore(
		useShallow((s) => ({ size: s.size, trackItemIds: s.trackItemIds })),
	);
	const { zoom, recalculateZoom } = useZoom(containerRef as React.RefObject<HTMLDivElement>, size);

	// Expose the recalculateZoom function to parent
	useImperativeHandle(ref, () => ({
		recalculateZoom,
	}));

	return (
		<div
			style={{
				width: "100%",
				height: "100%",
				position: "relative",
				flex: 1,
				overflow: "hidden",
				background: "transparent",
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
			}}
			ref={containerRef}
		>
			{trackItemIds.length === 0 ? <SceneEmpty /> : null}
			<div
				style={{
					width: size.width,
					height: size.height,
					background: "#000000",
					transform: `scale(${zoom})`,
					position: "absolute",
				}}
				className="player-container bg-sidebar"
			>
				<div
					style={{
						position: "absolute",
						zIndex: 100,
						pointerEvents: "none",
						width: size.width,
						height: size.height,
						background: "transparent",
						boxShadow: "0 0 0 5000px var(--card)",
					}}
				/>
				<Board size={size}>
					<Suspense fallback={null}>
						<Player />
					</Suspense>
					<SceneInteractions
						stateManager={stateManager}
						containerRef={containerRef as React.RefObject<HTMLDivElement>}
						zoom={zoom}
						size={size}
					/>
				</Board>
			</div>
		</div>
	);
});

Scene.displayName = "Scene";

export default Scene;
