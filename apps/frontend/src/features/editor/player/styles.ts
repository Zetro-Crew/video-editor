import type { IImage, IText, ITrackItem } from "@designcombo/types";

const isTransparentBackground = (backgroundColor: string | undefined) => {
	if (!backgroundColor) return true;
	const normalized = backgroundColor.trim().toLowerCase();
	return (
		normalized === "" ||
		normalized === "transparent" ||
		normalized === "none" ||
		normalized === "rgba(0,0,0,0)" ||
		normalized === "rgba(0, 0, 0, 0)"
	);
};

const isLightColor = (color: string | undefined) => {
	if (!color) return true;
	const normalized = color.trim();
	if (!normalized.startsWith("#")) {
		return normalized.toLowerCase() !== "black";
	}

	const hex = normalized.slice(1);
	const expanded =
		hex.length === 3
			? hex
					.split("")
					.map((char) => `${char}${char}`)
					.join("")
			: hex;

	if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return true;

	const r = Number.parseInt(expanded.slice(0, 2), 16);
	const g = Number.parseInt(expanded.slice(2, 4), 16);
	const b = Number.parseInt(expanded.slice(4, 6), 16);
	const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
	return luminance >= 0.5;
};

const containsRtl = (text: string | undefined) =>
	typeof text === "string" &&
	/[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

const getReadableStroke = (details: IText["details"]) => {
	const explicitStrokeWidth =
		typeof details.WebkitTextStrokeWidth === "string"
			? Number.parseFloat(details.WebkitTextStrokeWidth) || 0
			: details.borderWidth || 0;
	const explicitStrokeColor = details.WebkitTextStrokeColor || details.borderColor || "#000000";

	if (explicitStrokeWidth > 0) {
		return {
			strokeWidth: explicitStrokeWidth,
			strokeColor: explicitStrokeColor,
		};
	}

	const shouldAddFallbackStroke =
		(details.fontSize || 0) >= 48 &&
		isTransparentBackground(details.backgroundColor) &&
		(details.boxShadow?.blur || 0) === 0;

	if (!shouldAddFallbackStroke) {
		return { strokeWidth: 0, strokeColor: explicitStrokeColor };
	}

	return {
		strokeWidth: Math.max(2, Math.round((details.fontSize || 16) / 18)),
		strokeColor: isLightColor(details.color) ? "#000000" : "#ffffff",
	};
};

const calculateCropStyles = (details: IImage["details"], crop: IImage["details"]["crop"]) => ({
	width: details.width || "100%",
	height: details.height || "auto",
	top: -crop.y || 0,
	left: -crop.x || 0,
	position: "absolute",
	borderRadius: `${Math.min(crop.width, crop.height) * ((details.borderRadius || 0) / 100)}px`,
});

export const calculateMediaStyles = (
	details: ITrackItem["details"],
	crop: ITrackItem["details"]["crop"],
) => {
	return {
		pointerEvents: "none",
		boxShadow: [
			`0 0 0 ${details.borderWidth}px ${details.borderColor}`,
			details.boxShadow
				? `${details.boxShadow.x}px ${details.boxShadow.y}px ${details.boxShadow.blur}px ${details.boxShadow.color}`
				: "",
		]
			.filter(Boolean)
			.join(", "),
		...calculateCropStyles(details, crop),
		overflow: "hidden",
	} as React.CSSProperties;
};

export const calculateTextStyles = (details: IText["details"]): React.CSSProperties => {
	const { strokeWidth, strokeColor } = getReadableStroke(details);

	return {
		position: "relative",
		textDecoration: details.textDecoration || "none",
		WebkitTextStroke: `${strokeWidth}px ${strokeColor}`,
		WebkitTextStrokeWidth: `${strokeWidth}px`,
		WebkitTextStrokeColor: strokeColor,
		paintOrder: "stroke fill",
		textShadow: details.boxShadow
			? `${details.boxShadow.x}px ${details.boxShadow.y}px ${details.boxShadow.blur}px ${details.boxShadow.color}`
			: "",
		fontFamily: details.fontFamily || "Arial",
		fontWeight: details.fontWeight || "normal",
		lineHeight: details.lineHeight || "normal",
		letterSpacing: details.letterSpacing || "normal",
		wordSpacing: details.wordSpacing || "normal",
		wordWrap: details.wordWrap || "",
		wordBreak: details.wordBreak || "normal",
		textTransform: details.textTransform || "none",
		fontSize: details.fontSize || "16px",
		textAlign: details.textAlign || "left",
		color: details.color || "#000000",
		backgroundColor: details.backgroundColor || "transparent",
		direction: containsRtl(details.text) ? "rtl" : "ltr",
		unicodeBidi: "plaintext",
		borderRadius: `${Math.min(details.width, details.height) * ((details.borderRadius || 0) / 100)}px`,
	};
};

export const calculateContainerStyles = (
	details: ITrackItem["details"],
	crop: ITrackItem["details"]["crop"] = {},
	overrides: React.CSSProperties = {},
	type?: string,
): React.CSSProperties => {
	return {
		pointerEvents: "auto",
		top: details.top || 0,
		left: details.left || 0,
		width: crop.width || details.width || "100%",
		height:
			type === "text" || type === "caption"
				? "max-content"
				: crop.height || details.height || "max-content",
		transform: details.transform || "none",
		opacity: details.opacity !== undefined ? details.opacity / 100 : 1,
		transformOrigin: details.transformOrigin || "center center",
		filter: `brightness(${details.brightness}%) blur(${details.blur}px)`,
		rotate: details.rotate || "0deg",
		...overrides, // Merge overrides into the calculated styles
	};
};
