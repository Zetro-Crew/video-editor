import path from "node:path";
import type { ShapeOverlay } from "@video-editor/contract/internal/edit-video";
import sharp from "sharp";
import { buildEnableExpression, buildPositionExpression } from "./overlay-utils.ts";

const DEFAULT_SIZE = 100;

const decodeSvg = (svgData: string): string => {
	if (svgData.startsWith("data:image/svg+xml;base64,")) {
		return Buffer.from(svgData.slice("data:image/svg+xml;base64,".length), "base64").toString(
			"utf8",
		);
	}
	return svgData;
};

const SVG_SHAPE_TAGS = ["circle", "rect", "polygon", "path", "polyline", "ellipse", "line"];

const injectShapeStyles = (rawSvg: string, overlay: ShapeOverlay): string => {
	const fillColor = overlay.backgroundColor ?? "transparent";
	const strokeColor = overlay.borderColor;
	const strokeWidth = overlay.borderWidth;

	const styleRules = [
		`fill: ${fillColor};`,
		strokeColor !== undefined ? `stroke: ${strokeColor};` : "",
		strokeWidth !== undefined ? `stroke-width: ${strokeWidth};` : "",
	]
		.filter(Boolean)
		.join(" ");

	const scopeClass = `sv-${overlay.id.replace(/[^a-zA-Z0-9]/g, "")}`;
	const scopedSelectors = SVG_SHAPE_TAGS.map((t) => `.${scopeClass} ${t}`).join(",");

	return rawSvg.replace(
		/(<svg\b)([^>]*>)/i,
		`$1 class="${scopeClass}"$2<style>${scopedSelectors}{${styleRules}}</style>`,
	);
};

export const prepareShapeOverlay = async (
	overlay: ShapeOverlay,
	tempDir: string,
): Promise<string> => {
	const rawSvg = decodeSvg(overlay.svgData);
	const styledSvg = injectShapeStyles(rawSvg, overlay);
	const outPath = path.join(tempDir, `shape-overlay-${overlay.id}.png`);
	const sharpInstance = sharp(Buffer.from(styledSvg));
	if (overlay.width !== undefined && overlay.height !== undefined) {
		sharpInstance.resize(Math.round(overlay.width), Math.round(overlay.height), { fit: "fill" });
	}
	await sharpInstance.png().toFile(outPath);
	return outPath;
};

export const buildShapeOverlayFilter = (
	overlay: ShapeOverlay,
	imageInputIndex: number,
	currentStream: string,
	outputLabel: string,
): string => {
	const w = overlay.width ?? DEFAULT_SIZE;
	const h = overlay.height ?? DEFAULT_SIZE;
	const x = buildPositionExpression(overlay.x, "x");
	const y = buildPositionExpression(overlay.y, "y");
	const enable = buildEnableExpression(overlay.start, overlay.end);
	const imgInput = `[${imageInputIndex}:v]`;
	const scaledLabel = `shapeScaled${imageInputIndex}`;
	return `${imgInput}scale=w=${w}:h=${h}[${scaledLabel}];${currentStream}[${scaledLabel}]overlay=${x}:${y}:enable='${enable}'[${outputLabel}]`;
};
