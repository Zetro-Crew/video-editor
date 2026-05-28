import styled from "@emotion/styled";

/** @jsxImportSource @emotion/react */
import { type FC, type MouseEvent, type TouchEvent, useEffect, useRef } from "react";

import type { TCoords, TPropsCompAlpha } from "./types";

const rgbaColor = (r: number, g: number, b: number, a: number) => {
	return `rgba(${[r, g, b, a / 100].join(",")})`;
};

type MouseHandler = (e: globalThis.MouseEvent) => void;
type TouchHandler = (e: globalThis.TouchEvent) => void;
type VoidHandler = () => void;

// Styled components
const Container = styled.div`
  position: relative;
  height: 100%;
  width: 100%;
  border-radius: 4px;
  background:
    linear-gradient(to right, transparent, black),
    url('data:image/svg+xml;utf8, <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path fill="white" d="M1,0H2V1H1V0ZM0,1H1V2H0V1Z"/><path fill="gray" d="M0,0H1V1H0V0ZM1,1H2V2H1V1Z"/></svg>');
  background-size: 100%, 6px;
  background-repeat: repeat;
  user-select: none;
`;

const Background = styled.div<{ background: string }>`
  height: 100%;
  width: 100%;
  position: absolute;
  border-radius: 4px;
  background: ${(props) => props.background};
`;

const Pointer = styled.span<{ left: number; backgroundColor: string }>`
  position: absolute;
  top: -3px;
  height: 14px;
  width: 14px;
  padding: 1px 0;
  margin-left: -7px;
  border-radius: 50%;
  border: solid 2px white;
  cursor: grab;
  left: ${(props) => props.left}%;
  background-color: ${(props) => props.backgroundColor};
`;

const Overlay = styled.div`
  position: absolute;
  height: 100%;
  width: 100%;
  cursor: grab;
`;

const Alpha: FC<TPropsCompAlpha> = ({ color, alpha, onChange, setChange }) => {
	const node = useRef<HTMLDivElement>(null);
	const mouseMoveRef = useRef<MouseHandler | null>(null);
	const mouseUpRef = useRef<MouseHandler | null>(null);
	const touchMoveRef = useRef<TouchHandler | null>(null);
	const touchEndRef = useRef<VoidHandler | null>(null);

	const removeListeners = () => {
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

	const onMouseDown = (e: MouseEvent) => {
		removeListeners();

		pointMoveTo({ x: e.clientX, y: e.clientY });

		const onDrag: MouseHandler = (ev) => {
			pointMoveTo({ x: ev.clientX, y: ev.clientY });
		};
		const onDragEnd: MouseHandler = (ev) => {
			pointMoveTo({ x: ev.clientX, y: ev.clientY });
			setChange(false);
			removeListeners();
		};

		mouseMoveRef.current = onDrag;
		mouseUpRef.current = onDragEnd;
		window.addEventListener("mousemove", onDrag);
		window.addEventListener("mouseup", onDragEnd);
	};

	const onTouchStart = (e: TouchEvent) => {
		if (e.cancelable) {
			e.preventDefault();
		}

		if (e.touches.length !== 1) {
			return;
		}

		removeTouchListeners();

		pointMoveTo({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });

		const onTouchMove: TouchHandler = (ev) => {
			if (ev.cancelable) {
				ev.preventDefault();
			}
			pointMoveTo({ x: ev.targetTouches[0].clientX, y: ev.targetTouches[0].clientY });
		};
		const onTouchEnd: VoidHandler = () => {
			removeTouchListeners();
		};

		touchMoveRef.current = onTouchMove;
		touchEndRef.current = onTouchEnd;
		window.addEventListener("touchmove", onTouchMove, { passive: false });
		window.addEventListener("touchend", onTouchEnd, { passive: false });
	};

	const getBackground = () => {
		const { red, green, blue } = color;
		const opacityGradient = `linear-gradient(to right, ${rgbaColor(
			red,
			green,
			blue,
			0,
		)} , ${rgbaColor(red, green, blue, 100)})`;

		return opacityGradient;
	};

	const pointMoveTo = (coords: TCoords) => {
		const rect = node?.current?.getBoundingClientRect();
		if (!rect) return;
		const width = rect.width;
		let left = coords.x - rect.left;

		left = Math.max(0, left);
		left = Math.min(left, width);

		const alpha = Math.round((left / width) * 100);

		onChange(alpha);
	};

	const getPointerBackground = () => {
		const { red, green, blue } = color;
		const alphaVal = (alpha || 1) / 100;

		return `rgba(${red}, ${green}, ${blue}, ${alphaVal})`;
	};

	return (
		<Container ref={node} onMouseDown={onMouseDown} onTouchStart={onTouchStart}>
			<Background background={getBackground()} />
			<Pointer left={alpha || 0} backgroundColor={getPointerBackground()} />
			<Overlay />
		</Container>
	);
};

export default Alpha;
