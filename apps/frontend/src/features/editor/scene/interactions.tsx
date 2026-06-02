import { dispatch } from "@designcombo/events";
import type StateManager from "@designcombo/state";
import { EDIT_OBJECT, LAYER_CLONE, LAYER_DELETE } from "@designcombo/state";
import { Moveable, Selection } from "@interactify/toolkit";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import useCompositionStore from "../store/use-composition-store";
import useEditorRefs from "../store/use-editor-refs";
import useLayoutStore from "../store/use-layout-store";
import { getIdFromClassName } from "../utils/scene";
import {
	emptySelection,
	getSelectionByIds,
	getTargetById,
	type SelectionInfo,
} from "../utils/target";
import { calculateMinWidth, calculateTextHeight, htmlToPlainText } from "../utils/text";
import { getCurrentTime } from "../utils/time";
import { SceneContextMenu } from "./context-menu";

let holdGroupPosition: Record<string, any> | null = null;
let dragStartEnd = false;

interface SceneInteractionsProps {
	stateManager: StateManager;
	containerRef: React.RefObject<HTMLDivElement>;
	zoom: number;
	size: { width: number; height: number };
}

const snapDirections = {
	top: true,
	left: true,
	bottom: true,
	right: true,
	center: true,
	middle: true,
};

function scaleDiv(selector: string, scale: number, currentWidth: number, currentHeight: number) {
	const div = document.querySelector(selector) as HTMLDivElement | null;
	if (div) {
		const fontSize = Number.parseFloat(getComputedStyle(div).fontSize);
		div.style.fontSize = `${fontSize * scale}px`;
		div.style.width = `${currentWidth * scale}px`;
		div.style.height = `${currentHeight * scale}px`;
	}
}

export function SceneInteractions({
	stateManager,
	containerRef,
	zoom,
	size,
}: SceneInteractionsProps) {
	const [targets, setTargets] = useState<HTMLDivElement[]>([]);
	const [selection, setSelection] = useState<Selection>();
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
	const [iconPos, setIconPos] = useState<{ x: number; y: number } | null>(null);
	const activeIds = useCompositionStore((s) => s.activeIds);
	const { setControlItemOpen } = useLayoutStore(
		useShallow((s) => ({ setControlItemOpen: s.setControlItemOpen })),
	);

	const computeIconPos = (id: string): { x: number; y: number } | null => {
		const el = document.getElementById(id);
		if (!el) return null;
		const rect = el.getBoundingClientRect();
		return {
			x: rect.left + rect.width / 2,
			y: rect.top - 36,
		};
	};
	const { trackItemsMap, trackItemIds, updateTrackItemDetails } = useCompositionStore(
		useShallow((s) => ({
			trackItemsMap: s.trackItemsMap,
			trackItemIds: s.trackItemIds,
			updateTrackItemDetails: s.updateTrackItemDetails,
		})),
	);
	const { playerRef, setSceneMoveableRef } = useEditorRefs(
		useShallow((s) => ({
			playerRef: s.playerRef,
			setSceneMoveableRef: s.setSceneMoveableRef,
		})),
	);
	const moveableRef = useRef<Moveable>(null);
	const seekedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const selectEndTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const [selectionInfo, setSelectionInfo] = useState<SelectionInfo>(emptySelection);

	const elementGuidelines = useMemo(
		() =>
			["artboard", ...trackItemIds.filter((id) => !activeIds.includes(id))].map(
				(id) => `#${typeof window !== "undefined" && window.CSS ? window.CSS.escape(id) : id}`,
			),
		[trackItemIds, activeIds],
	);

	// Keep a ref to activeIds so the seeked listener always uses the latest
	// value without needing to re-register on every trackItemsMap change.
	const activeIdsRef = useRef(activeIds);
	useEffect(() => {
		activeIdsRef.current = activeIds;
	}, [activeIds]);

	useEffect(() => {
		const updateTargets = (time?: number) => {
			const currentTime = time || getCurrentTime();
			const { trackItemsMap } = useCompositionStore.getState();
			const targetIds = activeIdsRef.current.filter((id) => {
				return (
					trackItemsMap[id]?.display.from <= currentTime &&
					trackItemsMap[id]?.display.to >= currentTime
				);
			});
			const targets = targetIds.map((id) => getTargetById(id) as HTMLDivElement);
			selection?.setSelectedTargets(targets);
			const selInfo = getSelectionByIds(targetIds);
			setSelectionInfo(selInfo);
			setTargets(selInfo.targets as HTMLDivElement[]);
		};
		const timer = setTimeout(() => {
			updateTargets();
		});

		const onSeeked = (v: any) => {
			clearTimeout(seekedTimerRef.current);
			seekedTimerRef.current = setTimeout(() => {
				const { fps } = useCompositionStore.getState();
				const seekedTime = (v.detail.frame / fps) * 1000;
				updateTargets(seekedTime);
			});
		};
		const playerEl = playerRef?.current;
		playerEl?.addEventListener("seeked", onSeeked);

		return () => {
			playerEl?.removeEventListener("seeked", onSeeked);
			clearTimeout(timer);
			clearTimeout(seekedTimerRef.current);
		};
		// trackItemsMap intentionally omitted — updateTargets reads from the store directly
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeIds, playerRef]);

	useEffect(() => {
		const selection = new Selection({
			container: containerRef.current,
			boundContainer: true,
			hitRate: 0,
			selectableTargets: [".designcombo-scene-item"],
			selectFromInside: false,
			selectByClick: true,
			toggleContinueSelect: "shift",
		})
			.on("select", (e) => {
				// Filter out audio items from selection
				const filteredSelected = e.selected.filter(
					(el) => !el.className.includes("designcombo-scene-item-type-audio"),
				);

				const ids = filteredSelected.map((el) => getIdFromClassName(el.className));

				setTargets(filteredSelected as HTMLDivElement[]);

				stateManager.updateState(
					{
						activeIds: ids,
					},
					{
						updateHistory: false,
						kind: "layer:selection",
					},
				);
			})
			.on("dragStart", (e) => {
				const target = e.inputEvent.target as HTMLDivElement;
				dragStartEnd = false;

				if (targets.includes(target)) {
					e.stop();
				}
				if (target && moveableRef?.current?.moveable.isMoveableElement(target)) {
					e.stop();
				}
			})
			.on("dragEnd", () => {
				dragStartEnd = true;
			})
			.on("selectEnd", (e) => {
				const moveable = moveableRef.current;
				if (e.isDragStart) {
					e.inputEvent.preventDefault();
					clearTimeout(selectEndTimerRef.current);
					selectEndTimerRef.current = setTimeout(() => {
						if (!dragStartEnd) {
							moveable?.moveable.dragStart(e.inputEvent);
						}
					});
				} else {
					// Filter out audio items from selection
					const filteredSelected = e.selected.filter(
						(el) => !el.className.includes("designcombo-scene-item-type-audio"),
					) as HTMLDivElement[];

					const ids = filteredSelected.map((el) => getIdFromClassName(el.className));

					stateManager.updateState(
						{
							activeIds: ids,
						},
						{
							updateHistory: false,
							kind: "layer:selection",
						},
					);

					setTargets(filteredSelected);
				}
			});
		setSelection(selection);
		return () => {
			clearTimeout(selectEndTimerRef.current);
			selection.destroy();
		};
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const handleContextMenu = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const sceneItem = target.closest(".designcombo-scene-item");
			if (!sceneItem) return;
			e.preventDefault();
			const id = getIdFromClassName((sceneItem as HTMLElement).className);
			stateManager.updateState(
				{ activeIds: [id] },
				{ updateHistory: false, kind: "layer:selection" },
			);
			setContextMenu({ x: e.clientX, y: e.clientY });
		};
		container.addEventListener("contextmenu", handleContextMenu);
		return () => container.removeEventListener("contextmenu", handleContextMenu);
	}, [containerRef]);

	useEffect(() => {
		const activeSelectionSubscription = stateManager.subscribeToActiveIds((newState) => {
			const { activeIds: newIds } = newState as { activeIds: string[] };
			if (!Array.isArray(newIds)) return;
			useCompositionStore.setState({ activeIds: newIds });
			if (newIds.length === 1) {
				setTimeout(() => setIconPos(computeIconPos(newIds[0])), 0);
			} else {
				setIconPos(null);
			}
		});

		return () => {
			activeSelectionSubscription.unsubscribe();
		};
	}, [zoom, size]);

	useEffect(() => {
		moveableRef.current?.moveable.updateRect();
	}, [activeIds]);

	useEffect(() => {
		setSceneMoveableRef(moveableRef as React.RefObject<Moveable>);
		return () => setSceneMoveableRef(null);
	}, [setSceneMoveableRef]);
	return (
		<>
			{contextMenu && (
				<SceneContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					onClose={() => setContextMenu(null)}
					onDelete={() => {
						dispatch(LAYER_DELETE);
						setContextMenu(null);
					}}
					onDuplicate={() => {
						dispatch(LAYER_CLONE);
						setContextMenu(null);
					}}
					onEditProperties={() => {
						setControlItemOpen(true);
						setContextMenu(null);
					}}
				/>
			)}
			{iconPos &&
				activeIds.length === 1 &&
				createPortal(
					<button
						type="button"
						style={{
							position: "fixed",
							top: iconPos.y,
							left: iconPos.x,
							transform: "translateX(-50%)",
						}}
						className="z-[150] flex h-7 w-7 items-center justify-center rounded-full bg-card border border-border/80 shadow-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
						onClick={(e) => {
							e.stopPropagation();
							setContextMenu({ x: e.clientX, y: e.clientY });
						}}
					>
						<MoreHorizontal size={14} />
					</button>,
					document.body,
				)}
			<Moveable
				ref={moveableRef}
				rotationPosition={"bottom"}
				renderDirections={selectionInfo.controls}
				{...selectionInfo.ables}
				origin={false}
				target={targets}
				zoom={1 / zoom}
				className="designcombo-scene-moveable"
				snappable
				elementGuidelines={elementGuidelines}
				elementSnapDirections={snapDirections}
				snapDirections={snapDirections}
				snapThreshold={30}
				snapGap={true}
				isDisplaySnapDigit={false}
				isDisplayInnerSnapDigit={false}
				onDrag={({ target, top, left }) => {
					target.style.top = `${top}px`;
					target.style.left = `${left}px`;
					const id = getIdFromClassName(target.className);
					setIconPos(computeIconPos(id));
				}}
				onDragEnd={({ target, isDrag }) => {
					if (!isDrag) return;
					const targetId = getIdFromClassName(target.className) as string;

					dispatch(EDIT_OBJECT, {
						payload: {
							[targetId]: {
								details: {
									left: Number.parseFloat(target.style.left),
									top: Number.parseFloat(target.style.top),
								},
							},
						},
					});
				}}
				onScale={({ target, transform, direction }) => {
					const [xControl, yControl] = direction;

					const moveX = xControl === -1;
					const moveY = yControl === -1;

					const scaleRegex = /scale\(([^)]+)\)/;
					const match = target.style.transform.match(scaleRegex);
					if (!match) return;

					//get current scale
					const [scaleX, scaleY] = match[1]
						.split(",")
						.map((value) => Number.parseFloat(value.trim()));

					//get new Scale
					const match2 = transform.match(scaleRegex);
					if (!match2) return;
					const [newScaleX, newScaleY] = match2[1]
						.split(",")
						.map((value) => Number.parseFloat(value.trim()));

					const currentWidth = target.clientWidth * scaleX;
					const currentHeight = target.clientHeight * scaleY;

					const newWidth = target.clientWidth * newScaleX;
					const newHeight = target.clientHeight * newScaleY;

					target.style.transform = transform;

					//Move element to initial Left position
					const diffX = currentWidth - newWidth;
					let newLeft = Number.parseFloat(target.style.left) - diffX / 2;

					const diffY = currentHeight - newHeight;
					let newTop = Number.parseFloat(target.style.top) - diffY / 2;

					if (moveX) {
						newLeft += diffX;
					}
					if (moveY) {
						newTop += diffY;
					}
					target.style.left = `${newLeft}px`;
					target.style.top = `${newTop}px`;
				}}
				onScaleEnd={({ target }) => {
					if (!target.style.transform) return;
					const targetId = getIdFromClassName(target.className) as string;

					dispatch(EDIT_OBJECT, {
						payload: {
							[targetId]: {
								details: {
									transform: target.style.transform,
									left: Number.parseFloat(target.style.left),
									top: Number.parseFloat(target.style.top),
								},
							},
						},
					});
				}}
				onRotate={({ target, transform }) => {
					target.style.transform = transform;
				}}
				onRotateEnd={({ target }) => {
					if (!target.style.transform) return;
					const targetId = getIdFromClassName(target.className) as string;
					dispatch(EDIT_OBJECT, {
						payload: {
							[targetId]: {
								details: {
									transform: target.style.transform,
								},
							},
						},
					});
				}}
				onDragGroup={({ events }) => {
					holdGroupPosition = {};
					for (let i = 0; i < events.length; i++) {
						const event = events[i];
						const id = getIdFromClassName(event.target.className);
						const trackItem = trackItemsMap[id];
						const left =
							Number.parseFloat(trackItem?.details.left as string) + event.beforeTranslate[0];
						const top =
							Number.parseFloat(trackItem?.details.top as string) + event.beforeTranslate[1];
						event.target.style.left = `${left}px`;
						event.target.style.top = `${top}px`;
						holdGroupPosition[id] = {
							left: left,
							top: top,
						};
					}
				}}
				onResize={({ target, width: nextWidth, height: nextHeight, direction }) => {
					const id = getIdFromClassName(target.className);
					if (direction[1] === 1 || direction[1] === -1) {
						if (trackItemsMap[id].type === "progressSquare") {
							const diffWidth = nextHeight - Number.parseFloat(target.style.height);
							const updateData: any = {
								width: nextWidth,
								height: nextHeight,
								left: Number.parseFloat(target.style.left),
							};
							if (direction[1] === -1) {
								const newTop = `${Number.parseFloat(target.style.top) - diffWidth}px`;
								target.style.top = newTop;
								updateData.top = newTop;
							}
							target.style.width = `${nextWidth}px`;
							target.style.height = `${nextHeight}px`;
							updateTrackItemDetails(id, updateData);
							return;
						}
						// Check if this is pure "s" direction (only vertical, no horizontal change)
						const isPureSouthDirection =
							(direction[1] === 1 || direction[1] === -1) && direction[0] === 0;

						// Handle "s" target type with content-aware height constraints (only for pure south direction)
						if (
							isPureSouthDirection &&
							(trackItemsMap[id].type === "text" || trackItemsMap[id].type === "caption")
						) {
							const type = trackItemsMap[id].type;

							const selector = type === "text" ? `[data-text-id="${id}"]` : `#caption-${id}`;

							const textEl = document.querySelector(selector) as HTMLDivElement;

							if (textEl) {
								// Calculate minimum content height for current width
								const minContentHeight = calculateTextHeight({
									family: textEl.style.fontFamily,
									fontSize: textEl.style.fontSize,
									fontWeight: textEl.style.fontWeight,
									letterSpacing: textEl.style.letterSpacing,
									lineHeight: textEl.style.lineHeight,
									text: (textEl as HTMLDivElement).innerHTML,
									textShadow: textEl.style.textShadow,
									webkitTextStroke: textEl.style.webkitTextStroke,
									width: `${nextWidth}px`,
									textTransform: textEl.style.textTransform,
								});

								// Use the larger of the requested height or minimum content height
								const finalHeight = Math.max(nextHeight, minContentHeight);

								// Update target dimensions
								target.style.width = `${nextWidth}px`;
								target.style.height = `${finalHeight}px`;

								// Safely access nested elements
								const animationDiv = target.firstElementChild
									?.firstElementChild as HTMLDivElement | null;
								if (animationDiv) {
									animationDiv.style.width = `${nextWidth}px`;
									animationDiv.style.height = `${finalHeight}px`;

									const textDiv = document.querySelector(
										`[data-text-id="${id}"]`,
									) as HTMLDivElement;
									if (textDiv) {
										textDiv.style.width = `${nextWidth}px`;
										textDiv.style.height = `${finalHeight}px`;
									}
								}

								// Update state with final dimensions
								updateTrackItemDetails(id, {
									width: nextWidth,
									height: finalHeight,
								});
								return;
							}
						}

						// Default behavior for other element types (proportional scaling)
						const currentWidth = target.clientWidth;
						const currentHeight = target.clientHeight;

						// Get new width and height
						const scaleY = nextHeight / currentHeight;
						const scale = scaleY;

						// Update target dimensions
						target.style.width = `${currentWidth * scale}px`;
						target.style.height = `${currentHeight * scale}px`;

						// Safely access nested elements
						const animationDiv = target.firstElementChild
							?.firstElementChild as HTMLDivElement | null;
						if (animationDiv) {
							animationDiv.style.width = `${currentWidth * scale}px`;
							animationDiv.style.height = `${currentHeight * scale}px`;

							if (trackItemsMap[id].type === "text") {
								scaleDiv(`[data-text-id="${id}"]`, scale, currentWidth, currentHeight);
							} else if (trackItemsMap[id].type === "caption") {
								scaleDiv(`#caption-${id}`, scale, currentWidth, currentHeight);
							}
						}
					} else {
						const id = getIdFromClassName(target.className);
						if (trackItemsMap[id].type === "text" || trackItemsMap[id].type === "caption") {
							const type = trackItemsMap[id].type;

							const selector = type === "text" ? `[data-text-id="${id}"]` : `#caption-${id}`;

							const textEl = document.querySelector(selector) as HTMLDivElement;

							const newHeight = calculateTextHeight({
								family: textEl?.style.fontFamily,
								fontSize: textEl?.style.fontSize,
								fontWeight: textEl?.style.fontWeight,
								letterSpacing: textEl?.style.letterSpacing,
								lineHeight: textEl?.style.lineHeight,
								text: (textEl! as HTMLDivElement).innerHTML,
								textShadow: textEl?.style.textShadow,
								webkitTextStroke: textEl?.style.webkitTextStroke,
								width: `${nextWidth}px`,
								textTransform: textEl?.style.textTransform,
							});

							const validHeight = calculateTextHeight({
								family: textEl?.style.fontFamily,
								fontSize: textEl?.style.fontSize,
								fontWeight: textEl?.style.fontWeight,
								letterSpacing: textEl?.style.letterSpacing,
								lineHeight: textEl?.style.lineHeight,
								text: htmlToPlainText((textEl! as HTMLDivElement).innerHTML),
								textShadow: textEl?.style.textShadow,
								webkitTextStroke: textEl?.style.webkitTextStroke,
								width: `${nextWidth}px`,
								textTransform: textEl?.style.textTransform,
							});

							const minWidth = calculateMinWidth({
								family: textEl?.style.fontFamily,
								fontSize: textEl?.style.fontSize,
								fontWeight: textEl?.style.fontWeight,
								letterSpacing: textEl?.style.letterSpacing,
								lineHeight: textEl?.style.lineHeight,
								text: (textEl! as HTMLDivElement).innerText,
								textShadow: textEl?.style.textShadow,
								webkitTextStroke: textEl?.style.webkitTextStroke,
								textTransform: textEl?.style.textTransform,
							});
							target.style.width = `${nextWidth}px`;
							target.style.minWidth = `${minWidth}px`;
							target.style.height = `${newHeight}px`;

							// Safely access nested elements
							const animationDiv = target.firstElementChild
								?.firstElementChild as HTMLDivElement | null;
							if (animationDiv) {
								animationDiv.style.width = `${nextWidth}px`;
								animationDiv.style.height = `${validHeight}px`;

								const type = trackItemsMap[id].type;
								const selector = type === "text" ? `[data-text-id="${id}"]` : `#caption-${id}`;

								const textDiv = document.querySelector(selector) as HTMLDivElement | null;

								if (textDiv) {
									textDiv.style.width = `${nextWidth}px`;
									textDiv.style.height = `${validHeight}px`;
								}
							}
							if (Math.floor(newHeight) !== Math.floor(validHeight)) {
								dispatch(EDIT_OBJECT, {
									payload: {
										[id]: {
											details: {
												width: nextWidth,
												height: newHeight,
											},
										},
									},
								});
							}
						}
						if (trackItemsMap[id].type === "progressSquare") {
							const currentWidth = Number.parseFloat(target.style.width);
							target.style.width = `${nextWidth}px`;
							target.style.height = `${nextHeight}px`;
							const updateData: any = {
								width: nextWidth,
								height: nextHeight,
								left: Number.parseFloat(target.style.left),
							};
							if (direction[0] === -1) {
								const diffWidth = nextWidth - currentWidth;
								target.style.left = `${Number.parseFloat(target.style.left) - diffWidth}px`;
								updateData.left = `${Number.parseFloat(target.style.left) - diffWidth}px`;
							}
							updateTrackItemDetails(id, {
								width: nextWidth,
								height: nextHeight,
							});
						}
					}
				}}
				onResizeEnd={({ target }) => {
					const targetId = getIdFromClassName(target.className) as string;

					const type = trackItemsMap[targetId].type;

					const selector =
						type === "text" ? `[data-text-id="${targetId}"]` : `#caption-${targetId}`;

					const textDiv = document.querySelector(selector) as HTMLDivElement;

					if (textDiv) {
						dispatch(EDIT_OBJECT, {
							payload: {
								[targetId]: {
									details: {
										...trackItemsMap[targetId].details,
										width: Number.parseFloat(target.style.width),
										height: Number.parseFloat(target.style.height),
										fontSize: Number.parseFloat(textDiv.style.fontSize),
									},
								},
							},
						});
					}
				}}
				onDragGroupEnd={() => {
					if (holdGroupPosition) {
						const payload: Record<string, Partial<any>> = {};
						for (const id of Object.keys(holdGroupPosition)) {
							const left = holdGroupPosition[id].left;
							const top = holdGroupPosition[id].top;
							payload[id] = {
								details: {
									top: top,
									left: left,
								},
							};
						}
						dispatch(EDIT_OBJECT, {
							payload: payload,
						});
						holdGroupPosition = null;
					}
				}}
			/>
		</>
	);
}
