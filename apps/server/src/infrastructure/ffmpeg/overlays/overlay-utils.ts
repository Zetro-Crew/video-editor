export const hexToRgb = (hex: string, opacity: number): string => {
	const cleanedHex = hex.replace(/^#/, "");
	const validHex = /^[0-9A-Fa-f]{6}$/.test(cleanedHex)
		? cleanedHex
		: (() => {
				console.warn(`Invalid hex color: ${hex}, using default FF0000`);
				return "FF0000";
			})();

	const alpha =
		opacity < 1
			? Math.round(opacity * 255)
					.toString(16)
					.padStart(2, "0")
			: "FF";

	return `0x${validHex}${alpha}`;
};

export const escapeTextForFFmpeg = (text: string): string => {
	return text
		.replace(/\\/g, "\\\\")
		.replace(/:/g, "\\:")
		.replace(/'/g, "\\'")
		.replace(/\[/g, "\\[")
		.replace(/\]/g, "\\]")
		.replace(/,/g, "\\,");
};

export const buildEnableExpression = (start: number, end: number): string => {
	return `between(t,${start},${end})`;
};

export const buildPositionExpression = (percent: number, axis: "x" | "y"): string => {
	return axis === "x" ? `W*${percent}/100` : `H*${percent}/100`;
};
