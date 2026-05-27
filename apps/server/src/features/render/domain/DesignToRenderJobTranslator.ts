import type { VideoRenderInput } from "../application/use-cases/VideoRenderUseCase.ts";

interface IDisplay {
	from: number;
	to: number;
}
interface ITrim {
	from: number;
	to: number;
}
interface ISize {
	width: number;
	height: number;
}

export interface ITrackItemBase {
	id: string;
	type: string;
	display: IDisplay;
	trim?: ITrim;
	duration?: number;
	details?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
}

interface ITrack {
	id: string;
	type: string;
	items: string[];
	muted?: boolean;
}

export interface IDesign {
	id: string | number;
	size: ISize;
	duration?: number;
	fps: number;
	tracks: ITrack[];
	trackItemIds: string[];
	trackItemsMap: Record<string, ITrackItemBase>;
}

function asNum(val: unknown, fallback = 0): number {
	if (typeof val === "number" && Number.isFinite(val)) return val;
	if (typeof val === "string") return Number.parseFloat(val) || fallback;
	return fallback;
}

function toPercent(val: unknown, total: number): number {
	const px = asNum(val);
	return total > 0 ? Math.min(100, Math.max(0, (px / total) * 100)) : 0;
}

function toOpacity(val: unknown): number | undefined {
	if (val === undefined || val === null) return undefined;
	const raw = asNum(val);
	if (!Number.isFinite(raw)) return undefined;
	// Schema validates 0-100; divide to get 0-1 range.
	return raw / 100;
}

function normalizeVolume(val: unknown): number {
	if (val === undefined || val === null) return 1;
	const raw = asNum(val, 100);
	if (!Number.isFinite(raw)) return 1;
	// Schema validates 0-100; divide to get 0-1 range.
	return raw / 100;
}

function isTransparentBackground(backgroundColor: unknown): boolean {
	if (typeof backgroundColor !== "string") return true;
	const normalized = backgroundColor.trim().toLowerCase();
	return (
		normalized === "" ||
		normalized === "transparent" ||
		normalized === "none" ||
		normalized === "rgba(0,0,0,0)" ||
		normalized === "rgba(0, 0, 0, 0)"
	);
}

function isLightColor(color: unknown): boolean {
	if (typeof color !== "string") return true;
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
}

function getReadableStroke(details: Record<string, unknown>): {
	strokeWidth?: number;
	strokeColor?: string;
} {
	const explicitStrokeWidth = asNum(details.WebkitTextStrokeWidth ?? details.borderWidth);
	const explicitStrokeColor =
		(details.WebkitTextStrokeColor as string | undefined) ??
		(details.borderColor as string | undefined);
	if (explicitStrokeWidth > 0) {
		return {
			strokeWidth: explicitStrokeWidth,
			strokeColor: explicitStrokeColor ?? "#000000",
		};
	}
	const fontSize = asNum(details.fontSize);
	const shouldAddFallbackStroke =
		fontSize >= 48 &&
		isTransparentBackground(details.backgroundColor) &&
		asNum(
			details.boxShadow && typeof details.boxShadow === "object"
				? (details.boxShadow as Record<string, unknown>).blur
				: 0,
		) === 0;
	if (!shouldAddFallbackStroke) {
		return {};
	}
	return {
		strokeWidth: Math.max(2, Math.round(fontSize / 18)),
		strokeColor: isLightColor(details.color) ? "#000000" : "#ffffff",
	};
}

function parseDegrees(val: unknown): number | undefined {
	if (typeof val === "number" && Number.isFinite(val)) return val;
	if (typeof val !== "string") return undefined;
	const match = /(-?\d+(?:\.\d+)?)deg/.exec(val);
	return match ? Number.parseFloat(match[1] ?? "0") : undefined;
}

function parseScale(transform?: unknown): { scaleX: number; scaleY: number } {
	if (typeof transform !== "string" || transform === "none") return { scaleX: 1, scaleY: 1 };
	const scaleMatch = /scale\(([^)]+)\)/.exec(transform);
	if (!scaleMatch) return { scaleX: 1, scaleY: 1 };
	const values =
		scaleMatch[1]
			?.split(",")
			.map((value) => Number.parseFloat(value.trim()))
			.filter((value) => Number.isFinite(value)) ?? [];
	if (values.length === 0) return { scaleX: 1, scaleY: 1 };
	if (values.length === 1) return { scaleX: values[0] ?? 1, scaleY: values[0] ?? 1 };
	return { scaleX: values[0] ?? 1, scaleY: values[1] ?? 1 };
}

function parseRotation(details: Record<string, unknown>): number | undefined {
	const explicitRotate = parseDegrees(details.rotate);
	if (explicitRotate !== undefined) return explicitRotate;
	const transform = details.transform;
	if (typeof transform !== "string") return undefined;
	const rotateMatch = /rotate\(([-\d.]+)deg\)/.exec(transform);
	return rotateMatch ? Number.parseFloat(rotateMatch[1] ?? "0") : undefined;
}

function getSortedTrackItems(
	track: ITrack | undefined,
	trackItemsMap: Record<string, ITrackItemBase>,
): ITrackItemBase[] {
	return (track?.items ?? [])
		.map((id) => trackItemsMap[id])
		.filter((item): item is ITrackItemBase => item !== undefined)
		.sort((a, b) => a.display.from - b.display.from);
}

function getTimelineEnd(
	tracks: ITrack[],
	trackItemsMap: Record<string, ITrackItemBase>,
	designDuration?: number,
): number {
	const itemEnd = tracks
		.filter((track) => track.type !== "helper")
		.flatMap((track) => track.items)
		.map((itemId) => trackItemsMap[itemId]?.display.to ?? 0)
		.reduce((max, current) => Math.max(max, current), 0);
	return Math.max(itemEnd, designDuration ?? 0) / 1000;
}

function getVideoTracks(tracks: ITrack[]): ITrack[] {
	return tracks.filter((track) => track.type === "main" || track.type === "video");
}

function isSceneAdjustedVisual(item: ITrackItemBase, size: ISize): boolean {
	const details = item.details ?? {};
	const width = asNum(details.width);
	const height = asNum(details.height);
	const left = asNum(details.left);
	const top = asNum(details.top);
	const opacity = asNum(details.opacity, 100);
	const blur = asNum(details.blur);
	const brightness = details.brightness === undefined ? 100 : asNum(details.brightness);
	const borderRadius = asNum(details.borderRadius);
	const rotation = parseRotation(details) ?? 0;
	const transform = typeof details.transform === "string" ? details.transform.trim() : "none";
	const crop = typeof details.crop === "object" && details.crop !== null ? details.crop : undefined;
	return (
		left !== 0 ||
		top !== 0 ||
		(width > 0 && Math.abs(width - size.width) > 0.5) ||
		(height > 0 && Math.abs(height - size.height) > 0.5) ||
		opacity !== 100 ||
		blur > 0 ||
		brightness !== 100 ||
		borderRadius > 0 ||
		rotation !== 0 ||
		(transform !== "" && transform !== "none") ||
		crop !== undefined
	);
}

export function translate(
	design: IDesign,
	format: "mp4" | "webp" | "dash",
	frameTimeMs?: number,
): VideoRenderInput {
	const { tracks, trackItemsMap, size, duration: designDuration } = design;

	const videoTracks = getVideoTracks(tracks);
	const mainTrack = tracks.find((t) => t.type === "main") ?? tracks.find((t) => t.type === "video");
	const audioTracks = tracks.filter((t) => t.type === "audio");
	const mainTrackIndex = mainTrack ? tracks.findIndex((track) => track.id === mainTrack.id) : -1;
	const timelineEnd = getTimelineEnd(tracks, trackItemsMap, designDuration);

	const mainItems = getSortedTrackItems(mainTrack, trackItemsMap);
	const shouldCompositeVideoRows =
		videoTracks.length > 1 ||
		mainItems.some((item) => item.type === "video" && isSceneAdjustedVisual(item, size));

	const sources: VideoRenderInput["sources"] = [];
	let timelinePosition = 0;

	if (shouldCompositeVideoRows) {
		const baseDuration = timelineEnd || (designDuration ? designDuration / 1000 : 5);
		sources.push({
			url: `internal://blank?w=${size.width}&h=${size.height}&fps=${design.fps}`,
			type: "video",
			duration: baseDuration,
		});
		timelinePosition = baseDuration;
	} else {
		for (const item of mainItems) {
			if (item.type === "text") continue;
			const details = item.details ?? {};
			const url = (details.src as string | undefined) ?? "";
			if (!url) continue;

			const itemFrom = item.display.from / 1000;
			const itemTo = item.display.to / 1000;

			if (itemFrom > timelinePosition + 0.001) {
				sources.push({
					url: `internal://blank?w=${size.width}&h=${size.height}&fps=${design.fps}`,
					type: "video",
					duration: itemFrom - timelinePosition,
				});
			}

			const type = item.type === "image" ? "image" : "video";
			const displayDuration = itemTo - itemFrom;
			const result: VideoRenderInput["sources"][0] = {
				url,
				type,
				duration: displayDuration,
			};

			if (item.trim !== undefined) {
				result.trimFrom = item.trim.from / 1000;
				result.trimTo = item.trim.to / 1000;
			}

			sources.push(result);
			timelinePosition = itemTo;
		}
	}

	const trimEnd = timelineEnd || timelinePosition || (designDuration ? designDuration / 1000 : 5);

	if (timelinePosition < trimEnd - 0.001) {
		sources.push({
			url: `internal://blank?w=${size.width}&h=${size.height}&fps=${design.fps}`,
			type: "video",
			duration: trimEnd - timelinePosition,
		});
	}

	const overlays: VideoRenderInput["overlays"] = [];

	for (const [trackIndex, track] of tracks.entries()) {
		if (track.type === "audio" || track.type === "helper") continue;

		const trackItems = getSortedTrackItems(track, trackItemsMap);

		for (const item of trackItems) {
			const details = item.details ?? {};
			const start = item.display.from / 1000;
			const end = item.display.to / 1000;
			const isPrimaryTrack = trackIndex === mainTrackIndex;

			const left = asNum(details.left);
			const top = asNum(details.top);
			const width = asNum(details.width);
			const height = asNum(details.height);

			if (item.type === "text") {
				const x = toPercent(left, size.width);
				const y = toPercent(top, size.height);
				const rawFontSize = asNum(details.fontSize);
				const fontSize = rawFontSize > 0 ? rawFontSize : undefined;
				const rawElementWidth = width;
				const elementWidth = rawElementWidth > 0 ? rawElementWidth : undefined;
				const rawElementHeight = height;
				const elementHeight = rawElementHeight > 0 ? rawElementHeight : undefined;
				const textAlign =
					details.textAlign === "center" || details.textAlign === "right"
						? details.textAlign
						: "left";
				const fontColor = details.color as string | undefined;
				const backgroundColor = details.backgroundColor as string | undefined;
				const opacity = toOpacity(details.opacity);
				const { strokeWidth, strokeColor } = getReadableStroke(details);
				overlays.push({
					id: item.id,
					type: "text" as const,
					text: (details.text as string | undefined) ?? "",
					start,
					end,
					trackOrder: trackIndex,
					x,
					y,
					canvasHeight: size.height,
					canvasWidth: size.width,
					...(elementWidth !== undefined && { elementWidth }),
					...(elementHeight !== undefined && { elementHeight }),
					textAlign: textAlign as "left" | "center" | "right",
					...(fontSize !== undefined && { fontSize }),
					...(fontColor !== undefined && { fontColor }),
					...(backgroundColor !== undefined && { backgroundColor }),
					...(strokeWidth !== undefined && { strokeWidth }),
					...(strokeColor !== undefined && { strokeColor }),
					...(opacity !== undefined && { opacity }),
				});
				continue;
			}

			if (item.type === "image") {
				if (!isPrimaryTrack || shouldCompositeVideoRows) {
					const imageUrl = (details.src as string | undefined) ?? "";
					if (!imageUrl) continue;

					const x = toPercent(left, size.width);
					const y = toPercent(top, size.height);
					const widthOpt = width || undefined;
					const heightOpt = height || undefined;
					const opacity = toOpacity(details.opacity);
					overlays.push({
						id: item.id,
						type: "image" as const,
						imageUrl,
						start,
						end,
						trackOrder: trackIndex,
						x,
						y,
						...(widthOpt !== undefined && { width: widthOpt }),
						...(heightOpt !== undefined && { height: heightOpt }),
						...(opacity !== undefined && { opacity }),
					});
				}
				continue;
			}

			if (item.type === "video") {
				if (!isPrimaryTrack || shouldCompositeVideoRows) {
					const sourceUrl = (details.src as string | undefined) ?? "";
					if (!sourceUrl) continue;

					const widthOpt = width || undefined;
					const heightOpt = height || undefined;
					const crop = details.crop;
					const opacity = toOpacity(details.opacity);
					const rotation = parseRotation(details);
					overlays.push({
						id: item.id,
						type: "video" as const,
						sourceUrl,
						start,
						end,
						trackOrder: trackIndex,
						left: left,
						top: top,
						...(widthOpt !== undefined && { width: widthOpt }),
						...(heightOpt !== undefined && { height: heightOpt }),
						...(item.trim !== undefined && {
							trimFrom: item.trim.from / 1000,
							trimTo: item.trim.to / 1000,
						}),
						...(opacity !== undefined && { opacity }),
						...(typeof details.transform === "string" && {
							transform: details.transform,
						}),
						...(crop !== undefined &&
							typeof crop === "object" &&
							crop !== null && {
								crop: {
									x: asNum((crop as Record<string, unknown>).x),
									y: asNum((crop as Record<string, unknown>).y),
									width: Math.max(
										1,
										asNum((crop as Record<string, unknown>).width) || width || size.width,
									),
									height: Math.max(
										1,
										asNum((crop as Record<string, unknown>).height) || height || size.height,
									),
								},
							}),
						...(details.blur !== undefined && { blur: asNum(details.blur) }),
						...(details.brightness !== undefined && {
							brightness: asNum(details.brightness),
						}),
						...(details.borderRadius !== undefined && {
							borderRadius: asNum(details.borderRadius),
						}),
						...(rotation !== undefined && { rotation }),
					});
				}
			}

			if (item.type === "shape") {
				const svgData = (details.src as string | undefined) ?? "";
				if (!svgData) continue;

				const { scaleX, scaleY } = parseScale(details.transform);
				const scaledWidth = width * Math.abs(scaleX);
				const scaledHeight = height * Math.abs(scaleY);
				// CSS transform-origin defaults to center; adjust left/top for scale offset
				const effectiveLeft = left - (scaledWidth - width) / 2;
				const effectiveTop = top - (scaledHeight - height) / 2;
				// Unclamped — off-canvas positions are valid (negative or > 100%)
				const x = size.width > 0 ? (effectiveLeft / size.width) * 100 : 0;
				const y = size.height > 0 ? (effectiveTop / size.height) * 100 : 0;
				const widthOpt = scaledWidth || undefined;
				const heightOpt = scaledHeight || undefined;
				const opacity = toOpacity(details.opacity);
				overlays.push({
					id: item.id,
					type: "shape" as const,
					svgData,
					start,
					end,
					trackOrder: trackIndex,
					x,
					y,
					...(widthOpt !== undefined && { width: widthOpt }),
					...(heightOpt !== undefined && { height: heightOpt }),
					...(opacity !== undefined && { opacity }),
					...(details.backgroundColor !== undefined && {
						backgroundColor: details.backgroundColor as string,
					}),
					...(details.borderColor !== undefined && {
						borderColor: details.borderColor as string,
					}),
					...(details.borderWidth !== undefined && {
						borderWidth: asNum(details.borderWidth),
					}),
				});
			}
		}
	}

	const audioTrackItems = audioTracks.flatMap((track) =>
		track.muted === true
			? []
			: track.items
					.map((id) => trackItemsMap[id])
					.filter((item): item is ITrackItemBase => item != null),
	);

	const audioSources: VideoRenderInput["audioSources"] = [];
	if (shouldCompositeVideoRows && mainTrack && mainTrack.muted !== true) {
		for (const item of mainItems) {
			if (item.type !== "video") continue;
			const hasOverlappingAudio = audioTrackItems.some(
				(a) => a.display.from < item.display.to && a.display.to > item.display.from,
			);
			if (hasOverlappingAudio) continue;
			const details = item.details ?? {};
			const src = (details.src as string | undefined) ?? "";
			if (!src) continue;
			const startTime = item.display.from / 1000;
			const displayDuration = (item.display.to - item.display.from) / 1000;
			const trimDuration = item.trim ? (item.trim.to - item.trim.from) / 1000 : displayDuration;
			const originalDuration = item.duration !== undefined ? item.duration / 1000 : undefined;
			const audioTrimStart = item.trim ? item.trim.from / 1000 : undefined;
			const audioTrimEnd = item.trim ? item.trim.to / 1000 : undefined;
			audioSources.push({
				url: src,
				startTime,
				duration: trimDuration,
				...(originalDuration !== undefined && { originalDuration }),
				...(audioTrimStart !== undefined && { audioTrimStart }),
				...(audioTrimEnd !== undefined && { audioTrimEnd }),
				sourceType: "video",
				volume: normalizeVolume(details.volume === undefined ? 100 : details.volume),
				muted: false,
				solo: false,
			});
		}
	}

	for (const track of audioTracks) {
		for (const itemId of track.items) {
			const item = trackItemsMap[itemId];
			if (!item) continue;
			const details = item.details ?? {};
			const src = (details.src as string | undefined) ?? "";
			if (!src) continue;
			const startTime = item.display.from / 1000;
			const displayDuration = (item.display.to - item.display.from) / 1000;
			const trimDuration = item.trim ? (item.trim.to - item.trim.from) / 1000 : displayDuration;
			const originalDuration = item.duration !== undefined ? item.duration / 1000 : undefined;
			const audioTrimStart = item.trim ? item.trim.from / 1000 : undefined;
			const audioTrimEnd = item.trim ? item.trim.to / 1000 : undefined;
			audioSources.push({
				url: src,
				startTime,
				duration: trimDuration,
				...(originalDuration !== undefined && { originalDuration }),
				...(audioTrimStart !== undefined && { audioTrimStart }),
				...(audioTrimEnd !== undefined && { audioTrimEnd }),
				sourceType: "audio",
				volume: normalizeVolume(details.volume),
				muted: track.muted === true,
				solo: false,
			});
		}
	}

	return {
		sources:
			sources.length > 0
				? sources
				: [
						{
							url: `internal://blank?w=${size.width}&h=${size.height}&fps=${design.fps}`,
							type: "video",
							duration: trimEnd || 5,
						},
					],
		trimEnd,
		cuts: [],
		overlays,
		audioSources,
		audioMixMode: audioTrackItems.length > 0 ? "replace" : "mix",
		format,
		...(frameTimeMs !== undefined && { frameTimeMs }),
	};
}
