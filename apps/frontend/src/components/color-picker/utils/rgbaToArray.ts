export default (color: any) => {
	if (!color) return;
	const normalizedColor = String(color);
	if (normalizedColor.toLowerCase() === "transparent") return [0, 0, 0, 0];
	if (normalizedColor[0] === "#") {
		const expandedColor =
			normalizedColor.length < 7
				? `#${normalizedColor[1]}${normalizedColor[1]}${normalizedColor[2]}${normalizedColor[2]}${normalizedColor[3]}${normalizedColor[3]}${normalizedColor.length > 4 ? normalizedColor[4] + normalizedColor[4] : ""}`
				: normalizedColor;
		return [
			Number.parseInt(expandedColor.substring(1, 3), 16),
			Number.parseInt(expandedColor.substring(3, 5), 16),
			Number.parseInt(expandedColor.substring(5, 7), 16),
			expandedColor.length > 7 ? Number.parseInt(expandedColor.substring(7, 9), 16) / 255 : 1,
		];
	}

	if (normalizedColor.indexOf("rgb") === 0) {
		const rgbaColor = `${normalizedColor},1`;
		const matches = rgbaColor.match(/[.\d]+/g);
		return matches?.map((component: string) => {
			return Number(component);
		});
	}
};
