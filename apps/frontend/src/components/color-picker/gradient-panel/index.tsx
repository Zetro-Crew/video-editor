/** @jsxImportSource @emotion/react */

import { css } from "@emotion/react";
import {
	type FC,
	type MouseEvent,
	memo,
	type TouchEvent,
	useEffect,
	useRef,
	useState,
} from "react";

type AnyHandler = (e: any) => void;
type VoidHandler = () => void;

import { RADIALS_POS } from "../constants";
import { arraysEqual, shallowEqual } from "../helper";
import getGradient from "../utils/getGradient";
import Markers from "./Markers";
import type { IPropsPanel, TCoords } from "./types";

const GradientPanel: FC<IPropsPanel> = ({
	color,
	setColor,
	activeColor,
	setActiveColor,
	setInit,
	format = "rgb",

	showGradientAngle = true,
	allowAddGradientStops = true,
}) => {
	const angleNode = useRef<HTMLDivElement>(null);
	const mouseMoveRef = useRef<AnyHandler | null>(null);
	const mouseUpRef = useRef<AnyHandler | null>(null);
	const touchMoveRef = useRef<AnyHandler | null>(null);
	const touchEndRef = useRef<VoidHandler | null>(null);

	const { stops, gradient, type, modifier } = color;

	const [radialsPosition, setRadialPosition] = useState(RADIALS_POS);

	const onClickMode = () => {
		setInit(false);
		switch (type) {
			case "linear": {
				const activePos = radialsPosition.find((item) => item.active);
				setColor({
					...color,
					modifier: activePos?.css || modifier,
					gradient: `${getGradient("radial", stops, activePos?.css || modifier, format)}`,
					type: "radial",
				});
				break;
			}

			case "radial": {
				setColor({
					...color,
					gradient: `${getGradient("linear", stops, 180, format)}`,
					type: "linear",
				});
				break;
			}

			default: {
				break;
			}
		}
	};

	const setActiveRadialPosition = (e: MouseEvent) => {
		setInit(false);
		const target = e.target as HTMLElement;
		const pos = target.getAttribute("data-pos");
		const newRadialsPosition = radialsPosition.map((item) => {
			if (item.pos === pos) {
				return {
					...item,
					active: true,
				};
			}

			return {
				...item,
				active: false,
			};
		});

		setRadialPosition(newRadialsPosition);

		const activePos = newRadialsPosition.find((item) => item.active);
		setColor({
			...color,
			modifier: activePos?.css || modifier,
			gradient: `${getGradient("radial", stops, activePos?.css || modifier, format)}`,
		});
	};

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
		if (touchMoveRef.current) {
			window.removeEventListener("touchmove", touchMoveRef.current);
			touchMoveRef.current = null;
		}
		if (touchEndRef.current) {
			window.removeEventListener("touchend", touchEndRef.current);
			touchEndRef.current = null;
		}
	};

	const onMouseDown = (e: any) => {
		e.preventDefault();

		setInit(false);

		if (e.button !== 0) return;

		if (e.target.className !== "gradient-mode" && type === "linear") {
			pointMoveTo({
				x: e.clientX,
				y: e.clientY,
				shiftKey: e.shiftKey,
				ctrlKey: e.ctrlKey * 2,
			});

			removeListeners();

			const onDrag: AnyHandler = (ev) => {
				pointMoveTo({
					x: ev.clientX,
					y: ev.clientY,
					shiftKey: ev.shiftKey,
					ctrlKey: ev.ctrlKey * 2,
				});
			};
			const onDragEnd: AnyHandler = (ev) => {
				pointMoveTo({
					x: ev.clientX,
					y: ev.clientY,
					shiftKey: ev.shiftKey,
					ctrlKey: ev.ctrlKey * 2,
				});
				removeListeners();
			};

			mouseMoveRef.current = onDrag;
			mouseUpRef.current = onDragEnd;
			window.addEventListener("mousemove", onDrag);
			window.addEventListener("mouseup", onDragEnd);
		}
	};

	const onTouchStart = (e: TouchEvent) => {
		setInit(false);

		if (e.cancelable) {
			e.preventDefault();
		}

		if (e.touches.length !== 1) {
			return;
		}

		removeTouchListeners();

		pointMoveTo({
			x: e.targetTouches[0].clientX,
			y: e.targetTouches[0].clientY,
			shiftKey: false,
			ctrlKey: 0,
		});

		const onTouchMove: AnyHandler = (ev) => {
			if (ev.cancelable) {
				ev.preventDefault();
			}
			pointMoveTo({
				x: ev.targetTouches[0].clientX,
				y: ev.targetTouches[0].clientY,
				shiftKey: false,
				ctrlKey: 0,
			});
		};
		const onTouchEnd: VoidHandler = () => {
			removeTouchListeners();
		};

		touchMoveRef.current = onTouchMove;
		touchEndRef.current = onTouchEnd;
		window.addEventListener("touchmove", onTouchMove, { passive: false });
		window.addEventListener("touchend", onTouchEnd, { passive: false });
	};

	const pointMoveTo = (coords: TCoords) => {
		const rect = angleNode?.current?.getBoundingClientRect();
		if (!rect) return;

		const boxcx = rect.left + rect.width / 2;
		const boxcy = rect.top + rect.height / 2;
		const radians = Math.atan2(coords.x - boxcx, coords.y - boxcy) - Math.PI;
		const degrees = Math.abs((radians * 180) / Math.PI);

		const div = [1, 2, 4][Number(coords.shiftKey || coords.ctrlKey)];
		const newAngle = degrees - (degrees % (45 / div));

		setColor({
			...color,
			gradient: `${getGradient(type, stops, newAngle, format)}`,
			modifier: newAngle,
		});
	};

	useEffect(() => {
		return () => {
			removeListeners();
			removeTouchListeners();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (type === "radial") {
			const activePos = radialsPosition.find((item) => item.css === modifier);
			setColor({
				...color,
				modifier: activePos?.css || modifier,
				gradient: `${getGradient("radial", stops, activePos?.css || modifier, format)}`,
			});

			setRadialPosition(
				RADIALS_POS.map((item) => {
					if (item.css === modifier) {
						return {
							...item,
							active: true,
						};
					}

					return {
						...item,
						active: false,
					};
				}),
			);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [modifier]);

	return (
		<div
			css={css`
        flex-direction: column;
        display: flex;
        z-index: 1;
        gap: 16px;
      `}
		>
			<div
				className="gradient-result"
				onMouseDown={showGradientAngle ? onMouseDown : undefined}
				onTouchStart={showGradientAngle ? onTouchStart : undefined}
				style={{ background: gradient }}
			>
				<div data-mode={type} className="gradient-mode" onClick={() => onClickMode()} />
				<div
					className="gradient-angle"
					ref={angleNode}
					style={{ visibility: type === "linear" ? "visible" : "hidden" }}
				>
					<div
						style={{
							transform: `rotate(${
								typeof modifier === "number" ? `${modifier - 90}deg` : modifier
							})`,
						}}
					/>
				</div>
				<div
					className="gradient-pos"
					style={{
						opacity: type === "radial" ? "1" : "0",
						visibility: type === "radial" ? "visible" : "hidden",
					}}
				>
					{radialsPosition.map((item) => {
						return (
							<div
								key={item.pos}
								data-pos={item.pos}
								className={item.active ? "gradient-active" : ""}
								onClick={(e) => setActiveRadialPosition(e)}
							/>
						);
					})}
				</div>
			</div>
			<Markers
				color={color}
				setColor={setColor}
				activeColor={activeColor}
				setActiveColor={setActiveColor}
				setInit={setInit}
				format={format}
				allowAddGradientStops={allowAddGradientStops}
			/>
		</div>
	);
};

const arePropsEqual = (prevProps: any, nextProps: any) => {
	if (
		arraysEqual(prevProps.color.stops, nextProps.color.stops) &&
		prevProps.color.modifier === nextProps.color.modifier &&
		prevProps.color.type === nextProps.color.type &&
		shallowEqual(prevProps.activeColor, nextProps.activeColor)
	) {
		return true;
	}

	return false;
};

export default memo(GradientPanel, arePropsEqual);
