import type { TextOverlay } from "@video-editor/contract/internal/edit-video";
import { getFontFileParameter, prepareRTLText } from "../../../shared/utils/font.utils.ts";
import {
	buildEnableExpression,
	buildPositionExpression,
	escapeTextForFFmpeg,
} from "./overlay-utils.ts";

const containsRTL = (text: string): boolean => /[֐-׿؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text);

// Approximate rendered char width as a fraction of fontSize (Roboto-Bold empirical)
const estimateLineWidthPx = (line: string, fontSize: number): number =>
	line.length * fontSize * (containsRTL(line) ? 0.45 : 0.55);

const preWrapText = (text: string, fontSize: number, elementWidth: number | undefined): string => {
	if (!elementWidth || elementWidth <= 0) return text;

	// Hebrew/Arabic chars are ~0.45× font size wide (Roboto-Bold); Latin is ~0.55×
	const avgCharWidth = fontSize * (containsRTL(text) ? 0.45 : 0.55);
	const maxChars = Math.max(1, Math.floor(elementWidth / avgCharWidth));

	const segments = text.split("\n");
	const wrappedSegments = segments.map((segment) => {
		const words = segment.split(" ");
		const lines: string[] = [];
		let current = "";
		for (const word of words) {
			const test = current ? `${current} ${word}` : word;
			if (test.length > maxChars && current) {
				lines.push(current);
				current = word;
			} else {
				current = test;
			}
		}
		if (current) lines.push(current);
		return lines.join("\n");
	});

	return wrappedSegments.join("\n");
};

const buildDrawtextFilter = (
	inputStream: string,
	outputLabel: string,
	escapedLine: string,
	xExpr: string,
	yExpr: string,
	fontFileParam: string,
	fontSizeExpression: string,
	fontColor: string,
	opacity: number,
	strokeWidth: number,
	strokeColor: string,
	enable: string,
	bgColor: string,
): string => {
	const hasTransparentBg =
		!bgColor || bgColor === "transparent" || bgColor === "none" || bgColor === "";
	const base = `${inputStream}drawtext=${fontFileParam}:text='${escapedLine}':fontsize=${fontSizeExpression}:fontcolor=${fontColor}@${opacity}:borderw=${strokeWidth}:bordercolor=${strokeColor}:x=${xExpr}:y=${yExpr}:enable='${enable}'`;
	return hasTransparentBg
		? `${base}[${outputLabel}]`
		: `${base}:box=1:boxcolor=${bgColor}:boxborderw=5[${outputLabel}]`;
};

export const buildTextOverlayFilter = (
	overlay: TextOverlay,
	currentStream: string,
	outputLabel: string,
): string => {
	const fontSize = overlay.fontSize ?? 24;
	const fontColor = overlay.fontColor ?? "white";
	const bgColor = overlay.backgroundColor ?? "black@0.5";
	const opacity = overlay.opacity ?? 1;
	const strokeWidth = overlay.strokeWidth ?? 0;
	const strokeColor = overlay.strokeColor ?? "black";
	const enable = buildEnableExpression(overlay.start, overlay.end);
	const fontFileParam = getFontFileParameter();

	const referenceHeight = overlay.canvasHeight ?? 240;
	const fontSizeExpression = `h*${fontSize}/${referenceHeight}`;

	const wrappedText = preWrapText(overlay.text, fontSize, overlay.elementWidth);
	const rtlPrepared = prepareRTLText(wrappedText);
	const lines = rtlPrepared.split("\n");

	const canvasWidth = overlay.canvasWidth ?? 0;
	const elementWidth = overlay.elementWidth ?? 0;
	const hasAlignContext = elementWidth > 0 && canvasWidth > 0;
	const textAlign = overlay.textAlign ?? "left";
	const needsPerLine =
		lines.length > 1 && hasAlignContext && (textAlign === "center" || textAlign === "right");

	if (needsPerLine) {
		// CSS textAlign centers each line independently; FFmpeg drawtext uses one x for all lines.
		// Generate one drawtext per line with per-line x and y computed from character estimates.
		const canvasLeftPx = (overlay.x / 100) * canvasWidth;
		const canvasTopPx = (overlay.y / 100) * (overlay.canvasHeight ?? referenceHeight);
		// CSS line-height: normal ≈ 1.2× font size
		const lineHeightPx = fontSize * 1.2;

		const filterParts: string[] = [];
		let stream = currentStream;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const isLast = i === lines.length - 1;
			const label = isLast ? outputLabel : `${outputLabel}l${i}`;

			const lineWidthPx = estimateLineWidthPx(line, fontSize);
			let xPx: number;
			if (textAlign === "center") {
				xPx = canvasLeftPx + Math.max(0, (elementWidth - lineWidthPx) / 2);
			} else {
				// right
				xPx = canvasLeftPx + Math.max(0, elementWidth - lineWidthPx);
			}
			const yPx = canvasTopPx + i * lineHeightPx;

			// Express in video-space using W/H variables (proportional to canvas dimensions)
			const xExpr = `W*${xPx}/${canvasWidth}`;
			const yExpr = `H*${yPx}/${overlay.canvasHeight ?? referenceHeight}`;

			filterParts.push(
				buildDrawtextFilter(
					stream,
					label,
					escapeTextForFFmpeg(line),
					xExpr,
					yExpr,
					fontFileParam,
					fontSizeExpression,
					fontColor,
					opacity,
					strokeWidth,
					strokeColor,
					enable,
					bgColor,
				),
			);
			stream = `[${label}]`;
		}

		return filterParts.join(";");
	}

	// Single line or left-aligned: use text_w for exact width-aware positioning
	const escapedText = escapeTextForFFmpeg(rtlPrepared);
	const xBase = buildPositionExpression(overlay.x, "x");
	const y = buildPositionExpression(overlay.y, "y");

	const x = (() => {
		if (!hasAlignContext) return xBase;

		const widthExpression = `W*${elementWidth}/${canvasWidth}`;
		if (textAlign === "center") {
			return `${xBase}+(${widthExpression}-text_w)/2`;
		}
		if (textAlign === "right") {
			return `${xBase}+${widthExpression}-text_w`;
		}
		return xBase;
	})();

	return buildDrawtextFilter(
		currentStream,
		outputLabel,
		escapedText,
		x,
		y,
		fontFileParam,
		fontSizeExpression,
		fontColor,
		opacity,
		strokeWidth,
		strokeColor,
		enable,
		bgColor,
	);
};
