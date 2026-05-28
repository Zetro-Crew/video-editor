import styled from "@emotion/styled";
/** @jsxImportSource @emotion/react */
import { type FC, type MouseEvent, type TouchEvent, useEffect, useRef } from "react";

type AnyMouseHandler = (e: any) => void;
type VoidHandler = () => void;

import TinyColor from "../utils/color";
import type { TCoords, TPropsComp } from "./types";

const WIDTH = 200;
const HEIGHT = 150;

// Styled components
const Container = styled.div`
  position: relative;
  margin-bottom: 16px;
  user-select: none;
`;

const ValueLayer = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
  z-index: 2;
  background-image: url(data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiA/PjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB2aWV3Qm94PSIwIDAgMSAxIiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJub25lIj48bGluZWFyR3JhZGllbnQgaWQ9Imxlc3NoYXQtZ2VuZXJhdGVkIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9InJnYigwLDAsMCkiIHN0b3Atb3BhY2l0eT0iMCIvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzAwMDAwMCIgc3RvcC1vcGFjaXR5PSIxIi8+PC9saW5lYXJHcmFkaWVudD48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSJ1cmwoI2xlc3NoYXQtZ2VuZXJhdGVkKSIgLz48L3N2Zz4=);
  background-image: linear-gradient(to bottom, transparent 0%, #000000 100%);
`;

const SaturationLayer = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
  z-index: 1;
  background-image: url(data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiA/PjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB2aWV3Qm94PSIwIDAgMSAxIiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJub25lIj48bGluZWFyR3JhZGllbnQgaWQ9Imxlc3NoYXQtZ2VuZXJhdGVkIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiNmZmZmZmYiIHN0b3Atb3BhY2l0eT0iMSIvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0icmdiKDAsMCwwKSIgc3RvcC1vcGFjaXR5PSIwIi8+PC9saW5lYXJHcmFkaWVudD48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSJ1cmwoI2xlc3NoYXQtZ2VuZXJhdGVkKSIgLz48L3N2Zz4=);
  background-image: linear-gradient(to right, #ffffff 0%, transparent 100%);
`;

const Pointer = styled.span<{
	left: string;
	top: string;
	backgroundColor: string;
}>`
  position: absolute;
  border-radius: 10px;
  width: 14px;
  height: 14px;
  border: solid 2px #ffffff;
  left: ${({ left }) => left};
  top: ${({ top }) => top};
  z-index: 2;
  background-color: ${({ backgroundColor }) => backgroundColor};
`;

const Overlay = styled.div`
  cursor: grab;
  user-select: none;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 3;
`;

const Board: FC<TPropsComp> = ({ color, onChange, setChange }) => {
	const node = useRef<HTMLDivElement>(null);
	const mouseMoveRef = useRef<AnyMouseHandler | null>(null);
	const mouseUpRef = useRef<AnyMouseHandler | null>(null);
	const touchMoveRef = useRef<AnyMouseHandler | null>(null);
	const touchEndRef = useRef<VoidHandler | null>(null);

	const removeListeners = () => {
		setChange(false);
		if (mouseMoveRef.current) {
			window.removeEventListener("mousemove", mouseMoveRef.current);
			mouseMoveRef.current = null;
		}
		if (mouseUpRef.current) {
			window.removeEventListener("mouseup", mouseUpRef.current);
			mouseUpRef.current = null;
		}
	};

	const removeTouchListeners = () => {
		setChange(false);
		if (touchMoveRef.current) {
			window.removeEventListener("touchmove", touchMoveRef.current);
			touchMoveRef.current = null;
		}
		if (touchEndRef.current) {
			window.removeEventListener("touchend", touchEndRef.current);
			touchEndRef.current = null;
		}
	};

	useEffect(() => {
		return () => {
			removeListeners();
			removeTouchListeners();
		};
	}, []);

	const onBoardMouseDown = (e: MouseEvent) => {
		e.preventDefault();
		const buttons = e.buttons;

		if (buttons !== 1) return;

		removeListeners();

		pointMoveTo({ x: e.clientX, y: e.clientY });

		const onBoardDrag: AnyMouseHandler = (ev) => {
			ev.preventDefault();
			pointMoveTo({ x: ev.clientX, y: ev.clientY });
		};
		const onBoardDragEnd: AnyMouseHandler = (ev) => {
			ev.preventDefault();
			pointMoveTo({ x: ev.clientX, y: ev.clientY });
			removeListeners();
		};

		mouseMoveRef.current = onBoardDrag;
		mouseUpRef.current = onBoardDragEnd;
		window.addEventListener("mousemove", onBoardDrag);
		window.addEventListener("mouseup", onBoardDragEnd);
	};

	const onBoardTouchStart = (e: TouchEvent) => {
		if (e.cancelable) {
			e.preventDefault();
		}

		if (e.touches.length !== 1) {
			return;
		}

		removeTouchListeners();

		pointMoveTo({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });

		const onBoardTouchMove: AnyMouseHandler = (ev) => {
			if (ev.cancelable) {
				ev.preventDefault();
			}
			pointMoveTo({ x: ev.targetTouches[0].clientX, y: ev.targetTouches[0].clientY });
		};
		const onBoardTouchEnd: VoidHandler = () => {
			removeTouchListeners();
		};

		touchMoveRef.current = onBoardTouchMove;
		touchEndRef.current = onBoardTouchEnd;
		window.addEventListener("touchmove", onBoardTouchMove, { passive: false });
		window.addEventListener("touchend", onBoardTouchEnd, { passive: false });
	};

	const pointMoveTo = (pos: TCoords) => {
		const rect = node?.current?.getBoundingClientRect();
		if (!rect) return;
		let left = pos.x - rect.left;
		let top = pos.y - rect.top;

		const rWidth = rect.width || WIDTH;
		const rHeight = rect.height || HEIGHT;

		left = Math.max(0, left);
		left = Math.min(left, rWidth);
		top = Math.max(0, top);
		top = Math.min(top, rHeight);

		color.saturation = left / rWidth;
		color.brightness = 1 - top / rHeight;

		onChange(color);
	};

	const hueHsv = {
		h: color.hue,
		s: 1,
		v: 1,
	};

	const hueColor = new TinyColor(hueHsv).toHexString();

	const xRel = color.saturation * 100;
	const yRel = (1 - color.brightness) * 100;

	return (
		<Container ref={node}>
			<div
				style={{
					height: "154px",
					minHeight: "154px",
					width: "100%",
					position: "relative",
					zIndex: 1,
					backgroundColor: hueColor,
				}}
			>
				<ValueLayer />
				<SaturationLayer />
			</div>
			<Pointer
				left={`calc(${xRel}% - 7px)`}
				top={`calc(${yRel}% - 7px)`}
				backgroundColor={color.toHexString()}
			/>

			<Overlay onMouseDown={onBoardMouseDown} onTouchStart={onBoardTouchStart} />
		</Container>
	);
};

export default Board;
