export interface CircleIconOptions {
	size: number;
	color: string;
	fill: boolean;
	strokeWidth: number;
	opacity: number;
}

const hexToRgb = (hex: string): string => {
	const cleaned = hex.replace(/^#/, "");
	if (!/^[0-9A-Fa-f]{6}$/.test(cleaned)) return "rgb(255,0,0)";
	const r = Number.parseInt(cleaned.slice(0, 2), 16);
	const g = Number.parseInt(cleaned.slice(2, 4), 16);
	const b = Number.parseInt(cleaned.slice(4, 6), 16);
	return `rgb(${r},${g},${b})`;
};

export const buildCircleSvg = (opts: CircleIconOptions): string => {
	const { size, color, fill, strokeWidth, opacity } = opts;
	const cx = size / 2;
	const cy = size / 2;
	const radius = fill ? size / 2 : Math.max(1, size / 2 - strokeWidth / 2);
	const rgb = hexToRgb(color);
	const fillAttr = fill ? `fill="${rgb}" fill-opacity="${opacity}"` : 'fill="none"';
	const strokeAttr = fill
		? ""
		: `stroke="${rgb}" stroke-opacity="${opacity}" stroke-width="${strokeWidth}"`;
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${cx}" cy="${cy}" r="${radius}" ${fillAttr} ${strokeAttr} />
</svg>`;
};
