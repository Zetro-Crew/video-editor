import { dispatch, filter, subject } from "@designcombo/events";
import { EDIT_OBJECT, ENTER_EDIT_MODE } from "@designcombo/state";
import type { ITrackItem } from "@designcombo/types";
import React, { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import useCompositionStore from "../store/use-composition-store";
import useEditorRefs from "../store/use-editor-refs";
import { calculateTextHeight } from "../utils/text";
import type { SequenceItemOptions } from "./base-sequence";
import { SequenceItemMap } from "./sequence-item";

// Measure text width via canvas — no DOM append/remove, no layout thrash.
// letterSpacing is applied via the modern ctx.letterSpacing API where available.
const measureWordWidth = (
	text: string,
	{
		fontSize,
		fontFamily,
		fontWeight,
		letterSpacing,
	}: { fontSize: string; fontFamily: string; fontWeight: string; letterSpacing: string },
): number => {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) return 0;
	ctx.font = [fontWeight, fontSize, `"${fontFamily}"`].filter(Boolean).join(" ");
	if ("letterSpacing" in ctx) {
		(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = letterSpacing;
	}
	return ctx.measureText(text).width;
};

type ItemOptions = Omit<SequenceItemOptions, "frame">;

// Memoized per-item wrapper. Re-renders ONLY when item data or shared options change,
// not on every Remotion frame tick. Each item component subscribes to useCurrentFrame()
// internally via its own React component boundary.
const SequenceItemWrapper = React.memo(
	({ item, options }: { item: ITrackItem; options: ItemOptions }) => {
		const Component = SequenceItemMap[item.type];
		if (!Component) return null;
		return <Component item={item} options={options} />;
	},
	(prev, next) =>
		prev.item === next.item &&
		prev.options.editableTextId === next.options.editableTextId &&
		prev.options.handleTextChange === next.options.handleTextChange &&
		prev.options.onTextBlur === next.options.onTextBlur &&
		prev.options.fps === next.options.fps &&
		prev.options.size === next.options.size,
);
SequenceItemWrapper.displayName = "SequenceItemWrapper";

const Composition = () => {
	const [editableTextId, setEditableTextId] = useState<string | null>(null);
	const { trackItemIds, trackItemsMap, fps, size } = useCompositionStore(
		useShallow((s) => ({
			trackItemIds: s.trackItemIds,
			trackItemsMap: s.trackItemsMap,
			fps: s.fps,
			size: s.size,
		})),
	);
	const { sceneMoveableRef } = useEditorRefs();

	const handleTextChange = useCallback(
		(id: string, _: string) => {
			const elRef = document.querySelector(`.id-${id}`) as HTMLDivElement;
			const containerDiv = elRef.firstElementChild?.firstElementChild as HTMLDivElement;
			const textDiv = elRef.firstElementChild?.firstElementChild?.firstElementChild
				?.firstElementChild?.firstElementChild as HTMLDivElement;

			const {
				fontFamily,
				fontSize,
				fontWeight,
				letterSpacing,
				lineHeight,
				textShadow,
				webkitTextStroke,
				textTransform,
			} = textDiv.style;
			if (!elRef.innerText) return;

			const words = elRef.innerText.split(/\s+/);
			const longestWord = words.reduce(
				(longest, word) => (word.length > longest.length ? word : longest),
				"",
			);

			const wordWidth = measureWordWidth(longestWord, {
				fontSize,
				fontFamily,
				fontWeight,
				letterSpacing,
			});

			const currentWidth = elRef.clientWidth;
			if (wordWidth > currentWidth) {
				elRef.style.width = `${wordWidth}px`;
				textDiv.style.width = `${wordWidth}px`;
				containerDiv.style.width = `${wordWidth}px`;
			}

			const newHeight = calculateTextHeight({
				family: fontFamily,
				fontSize,
				fontWeight,
				letterSpacing,
				lineHeight,
				text: elRef.innerText || "",
				textShadow: textShadow,
				webkitTextStroke,
				width: elRef.style.width,
				id: id,
				textTransform,
			});
			const currentHeight = elRef.clientHeight;
			if (newHeight > currentHeight) {
				elRef.style.height = `${newHeight}px`;
				textDiv.style.height = `${newHeight}px`;
			}
			sceneMoveableRef?.current?.moveable.updateRect();
			sceneMoveableRef?.current?.moveable.forceUpdate();
		},
		[sceneMoveableRef],
	);

	const onTextBlur = useCallback((id: string, _: string) => {
		const elRef = document.querySelector(`.id-${id}`) as HTMLDivElement;
		const textDiv = elRef.firstElementChild?.firstElementChild?.firstElementChild as HTMLDivElement;
		const {
			fontFamily,
			fontSize,
			fontWeight,
			letterSpacing,
			lineHeight,
			textShadow,
			webkitTextStroke,
			textTransform,
		} = textDiv.style;
		const { width } = elRef.style;
		if (!elRef.innerText) return;
		const newHeight = calculateTextHeight({
			family: fontFamily,
			fontSize,
			fontWeight,
			letterSpacing,
			lineHeight,
			text: elRef.innerText || "",
			textShadow: textShadow,
			webkitTextStroke,
			width,
			id: id,
			textTransform,
		});
		dispatch(EDIT_OBJECT, {
			payload: {
				[id]: {
					details: {
						height: newHeight,
					},
				},
			},
		});
	}, []);

	useEffect(() => {
		const stateEvents = subject.pipe(filter(({ key }) => key.startsWith(ENTER_EDIT_MODE)));

		const subscription = stateEvents.subscribe((obj) => {
			if (obj.key === ENTER_EDIT_MODE) {
				if (editableTextId) {
					const element = document.querySelector(
						`[data-text-id="${editableTextId}"]`,
					) as HTMLDivElement;

					let text = "";
					if (element) {
						for (let i = 0; i < element.childNodes.length; i++) {
							const node = element.childNodes[i];
							if (node.nodeType === Node.TEXT_NODE) {
								const nodeText = node.textContent || "";
								text += nodeText;
							} else if (node.nodeType === Node.ELEMENT_NODE) {
								const nodeText = node.textContent || "";
								text += `\n${nodeText}`;
							}
						}
					}

					if (trackItemIds.includes(editableTextId)) {
						dispatch(EDIT_OBJECT, {
							payload: {
								[editableTextId]: {
									details: {
										text: text || "",
									},
								},
							},
						});
					}
				}
				setEditableTextId(obj.value?.payload.id);
			}
		});
		return () => subscription.unsubscribe();
	}, [editableTextId]);

	const itemOptions: ItemOptions = {
		fps,
		handleTextChange,
		onTextBlur,
		editableTextId,
		size,
		isTransition: false,
	};

	return (
		<>
			{trackItemIds.map((id) => {
				const item = trackItemsMap[id];
				return <SequenceItemWrapper key={id} item={item} options={itemOptions} />;
			})}
		</>
	);
};

export default Composition;
