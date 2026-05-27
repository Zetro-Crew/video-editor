import { timeToString } from "../utils/time";

interface HoverPlayheadProps {
	left: number;
	timeMs: number;
}

const HoverPlayhead = ({ left, timeMs }: HoverPlayheadProps) => {
	return (
		<div
			style={{
				position: "absolute",
				left,
				top: 50,
				width: 1,
				height: "calc(100% - 40px)",
				zIndex: 9,
				pointerEvents: "none",
			}}
		>
			<div
				style={{
					position: "absolute",
					top: -22,
					left: "50%",
					transform: "translateX(-50%)",
					backgroundColor: "rgba(255,255,255,0.15)",
					border: "1px solid rgba(255,255,255,0.25)",
					borderRadius: 4,
					padding: "1px 5px",
					fontSize: 10,
					whiteSpace: "nowrap",
					color: "rgba(255,255,255,0.75)",
					pointerEvents: "none",
				}}
			>
				{timeToString({ time: timeMs })}
			</div>
			<div
				style={{
					position: "absolute",
					top: 0,
					left: "50%",
					transform: "translateX(-50%)",
					width: 1,
					height: "100%",
					backgroundColor: "rgba(255,255,255,0.35)",
				}}
			/>
		</div>
	);
};

export default HoverPlayhead;
