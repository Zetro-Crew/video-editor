import { PREVIEW_FRAME_WIDTH } from "../constants/constants";

/**
 * Converts raw timeline units to the readable format.
 * @param units Target unit value.
 * @returns Time in format HH:MM:SS.FPS
 */
export function formatTimelineUnit(units?: number): string {
	if (!units) return "0";
	const time = units / PREVIEW_FRAME_WIDTH;

	const frames = Math.trunc(time) % 60;
	const seconds = Math.trunc(time / 60) % 60;
	const minutes = Math.trunc(time / 3600) % 60;
	const hours = Math.trunc(time / 216000);
	const formattedTime = [
		hours.toString(),
		minutes.toString(),
		seconds.toString(),
		frames.toString(),
	];

	if (time < 60) {
		return `${formattedTime[3].padStart(2, "0")}f`;
	}
	if (time < 3600) {
		return `${formattedTime[2].padStart(1, "0")}s`;
	}
	if (time < 216000) {
		return `${formattedTime[1].padStart(2, "0")}:${formattedTime[2].padStart(2, "0")}`;
	}
	return `${formattedTime[0].padStart(2, "0")}:${formattedTime[1].padStart(2, "0")}:${formattedTime[2].padStart(2, "0")}`;
}
