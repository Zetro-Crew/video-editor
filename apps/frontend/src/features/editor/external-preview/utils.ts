export const isLikelyHlsSrc = (src: string) => {
	try {
		const normalizedPath = new URL(src, window.location.href).pathname.toLowerCase();
		return normalizedPath.endsWith(".m3u8");
	} catch {
		const lower = src.toLowerCase();
		return lower.includes(".m3u8");
	}
};

export const parseAllowedOrigins = (value?: string) =>
	new Set(
		(value || "")
			.split(",")
			.map((origin) => origin.trim())
			.filter(Boolean),
	);
