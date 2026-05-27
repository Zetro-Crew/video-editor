import fs from "node:fs";
import os from "node:os";

const FONT_CANDIDATES: Record<string, string[]> = {
	darwin: [
		"/System/Library/Fonts/Supplemental/Arial.ttf",
		"/System/Library/Fonts/Supplemental/Helvetica.ttf",
		"/Library/Fonts/Arial.ttf",
	],
	linux: [
		"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
		"/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
		"/usr/share/fonts/truetype/freefont/FreeSans.ttf",
	],
	win32: [
		"C:\\Windows\\Fonts\\arial.ttf",
		"C:\\Windows\\Fonts\\segoeui.ttf",
		"C:\\Windows\\Fonts\\calibri.ttf",
	],
};

function getResolvedFontPath(): string | null {
	const envFontPath = process.env.FFMPEG_FONT_PATH;
	if (envFontPath && fs.existsSync(envFontPath)) {
		return envFontPath;
	}

	const platform = os.platform();
	const candidates: string[] = FONT_CANDIDATES[platform] ?? FONT_CANDIDATES.linux ?? [];

	for (const fontPath of candidates) {
		try {
			if (fs.existsSync(fontPath)) {
				return fontPath;
			}
		} catch {}
	}

	return null;
}

function escapeFontPathForFFmpeg(fontPath: string): string {
	if (!fontPath) return "";
	let escaped = fontPath.replace(/\\/g, "/");
	escaped = escaped.replace(/:/g, "\\:");
	escaped = escaped.replace(/\[/g, "\\[");
	escaped = escaped.replace(/\]/g, "\\]");
	escaped = escaped.replace(/,/g, "\\,");
	escaped = escaped.replace(/;/g, "\\;");
	escaped = escaped.replace(/'/g, "\\'");
	return escaped;
}

export function getFontFileParameter(): string {
	const fontPath = getResolvedFontPath();
	if (!fontPath) {
		const platform = os.platform();
		const candidates = (FONT_CANDIDATES[platform] ?? FONT_CANDIDATES.linux ?? []).join(", ");
		throw new Error(
			`No font filename provided: no usable font found for drawtext. Tried (${platform}): ${candidates}. Set FFMPEG_FONT_PATH to a path to a .ttf font file, or install one of the candidate fonts.`,
		);
	}
	const escaped = escapeFontPathForFFmpeg(fontPath);
	return `fontfile='${escaped}'`;
}

function containsRTL(text: string): boolean {
	const rtlRegex = /[֐-׿؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
	return rtlRegex.test(text);
}

export function prepareRTLText(text: string): string {
	if (!text || !containsRTL(text)) {
		return text;
	}
	// FFmpeg drawtext renders LTR without bidi. For correct Hebrew display per line:
	// 1. Reverse word order so the first logical word ends up rightmost visually.
	// 2. Reverse chars within each RTL word so individual glyphs render in correct order.
	return text
		.split("\n")
		.map((line) => {
			if (!containsRTL(line)) return line;
			return line
				.split(" ")
				.reverse()
				.map((word) => (containsRTL(word) ? word.split("").reverse().join("") : word))
				.join(" ");
		})
		.join("\n");
}
