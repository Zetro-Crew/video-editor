import path from "node:path";
import sharp from "sharp";
import type { CircleOverlay } from "../../../shared/domain/render-types.ts";
import { buildCircleSvg } from "../../../shared/utils/icons/circle.ts";
import { buildEnableExpression, buildPositionExpression } from "./overlay-utils.ts";

const DEFAULT_SIZE = 200;

const generatePngFromSvg = async (svg: string, outPath: string): Promise<void> => {
	await sharp(Buffer.from(svg)).png().toFile(outPath);
};

const generateCirclePng = async (overlay: CircleOverlay, tempDir: string): Promise<string> => {
	const size = Math.max(1, overlay.width ?? overlay.height ?? DEFAULT_SIZE);
	const color = overlay.color ?? "#FF0000";
	const fill = overlay.fill ?? false;
	const strokeWidth = Math.max(1, Math.min(20, overlay.strokeWidth ?? 3));
	const opacity = overlay.opacity ?? 1;
	const svg = buildCircleSvg({ size, color, fill, strokeWidth, opacity });
	const outPath = path.join(tempDir, `circle-overlay-${overlay.id}.png`);
	await generatePngFromSvg(svg, outPath);
	return outPath;
};

export const prepareCircleOverlay = async (
	overlay: CircleOverlay,
	tempDir: string,
): Promise<string> => {
	return generateCirclePng(overlay, tempDir);
};

export const buildCircleOverlayFilter = (
	overlay: CircleOverlay,
	imageInputIndex: number,
	currentStream: string,
	outputLabel: string,
): string => {
	const widthPixels = overlay.width ?? DEFAULT_SIZE;
	const heightPixels = overlay.height ?? DEFAULT_SIZE;
	const x = buildPositionExpression(overlay.x, "x");
	const y = buildPositionExpression(overlay.y, "y");
	const enable = buildEnableExpression(overlay.start, overlay.end);
	const imgInput = `[${imageInputIndex}:v]`;
	const scaledLabel = `circleScaled${imageInputIndex}`;
	return `${imgInput}scale=w=${widthPixels}:h=${heightPixels}:force_original_aspect_ratio=decrease[${scaledLabel}];${currentStream}[${scaledLabel}]overlay=${x}:${y}:enable='${enable}'[${outputLabel}]`;
};
