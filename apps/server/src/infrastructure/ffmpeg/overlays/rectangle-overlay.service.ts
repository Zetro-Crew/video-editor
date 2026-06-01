import type { RectangleOverlay } from "@video-editor/contract/internal/edit-video";
import { buildEnableExpression, hexToRgb } from "./overlay-utils.ts";

const DEFAULT_SIZE = 200;

const buildDrawboxFilter = (
	overlay: RectangleOverlay,
	currentStream: string,
	outputLabel: string,
	widthPixels: number,
	heightPixels: number,
	rgbColor: string,
	thickness: string,
	enable: string,
): string => {
	const drawboxX = `iw*${overlay.x}/100`;
	const drawboxY = `ih*${overlay.y}/100`;
	return `${currentStream}drawbox=x=${drawboxX}:y=${drawboxY}:w=${widthPixels}:h=${heightPixels}:color=${rgbColor}:t=${thickness}:enable='${enable}'[${outputLabel}]`;
};

export const buildRectangleOverlayFilter = (
	overlay: RectangleOverlay,
	currentStream: string,
	outputLabel: string,
): string => {
	const widthPixels = overlay.width ?? DEFAULT_SIZE;
	const heightPixels = overlay.height ?? DEFAULT_SIZE;
	const color = overlay.color ?? "#FF0000";
	const strokeWidth = overlay.strokeWidth ?? 3;
	const fill = overlay.fill ?? false;
	const opacity = overlay.opacity ?? 1;
	const rgbColor = hexToRgb(color, opacity);
	const enable = buildEnableExpression(overlay.start, overlay.end);
	const thickness = fill ? "-1" : String(strokeWidth);
	return buildDrawboxFilter(
		overlay,
		currentStream,
		outputLabel,
		widthPixels,
		heightPixels,
		rgbColor,
		thickness,
		enable,
	);
};
