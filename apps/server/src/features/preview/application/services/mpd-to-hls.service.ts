import { XMLParser } from "fast-xml-parser";

export interface MpdToHlsInput {
	mpdXml: string;
	/** Full URL the MPD document was fetched from — anchor for RFC3986 BaseURL resolution. */
	mpdUrl: string;
	/** Absolute wall-clock timestamp (ms) of the first segment identified by startNumber. */
	segmentStartTimeMs: number;
	requestedStartMs: number;
	requestedEndMs: number;
	maxDurationMs?: number;
}

export interface MpdToHlsOutput {
	playlist: string;
	/** Milliseconds from the start of the first playlist segment to requestedStartMs. */
	sourceOffsetMs: number;
	/** Actual duration covered by requestedStartMs → requestedEndMs. */
	durationMs: number;
	width: number;
	height: number;
}

interface SegmentTemplate {
	timescale: number;
	duration: number;
	startNumber: number;
	initialization: string;
	media: string;
}

interface ParsedRepresentation {
	id: string;
	width: number;
	height: number;
	segmentTemplate: SegmentTemplate;
	mpdBase: string;
	periodBase: string;
	inheritedQuery: string;
}

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
});

function coerceBaseUrlEntry(entry: unknown): string | undefined {
	if (typeof entry === "string") return entry || undefined;
	if (entry && typeof entry === "object" && "#text" in (entry as Record<string, unknown>)) {
		const text = (entry as Record<string, unknown>)["#text"];
		if (text === undefined || text === null) return undefined;
		const s = String(text);
		return s || undefined;
	}
	return undefined;
}

// DASH allows multiple BaseURL siblings for CDN failover; we pick the first usable
// entry (single-CDN client). Scans the array so a malformed leading entry doesn't
// silently drop the valid alternates.
function extractBaseUrl(node: unknown): string | undefined {
	if (!node || typeof node !== "object") return undefined;
	const value = (node as { BaseURL?: unknown }).BaseURL;
	if (value === undefined || value === null) return undefined;
	if (Array.isArray(value)) {
		for (const entry of value) {
			const s = coerceBaseUrlEntry(entry);
			if (s) return s;
		}
		return undefined;
	}
	return coerceBaseUrlEntry(value);
}

function isVideoAdaptationSet(as: Record<string, unknown>): boolean {
	const ct = as["@_contentType"];
	if (typeof ct === "string" && ct === "video") return true;
	const mt = as["@_mimeType"];
	if (typeof mt === "string" && mt.startsWith("video/")) return true;
	// Fall back to inner Representation@mimeType — valid DASH may carry mimeType only on Representation.
	const rep = as.Representation;
	const reps = Array.isArray(rep) ? rep : rep !== undefined ? [rep] : [];
	return reps.some((r: unknown) => {
		if (!r || typeof r !== "object") return false;
		const m = (r as Record<string, unknown>)["@_mimeType"];
		return typeof m === "string" && m.startsWith("video/");
	});
}

function selectVideoAdaptationSet(
	period: Record<string, unknown>,
): Record<string, unknown> | undefined {
	const raw = period.AdaptationSet;
	const list = Array.isArray(raw) ? raw : raw !== undefined ? [raw] : [];
	return list.find((as: unknown) => {
		if (!as || typeof as !== "object") return false;
		return isVideoAdaptationSet(as as Record<string, unknown>);
	}) as Record<string, unknown> | undefined;
}

function parseMpd(mpdXml: string, mpdUrl: string): ParsedRepresentation {
	const doc = parser.parse(mpdXml);
	const mpd = doc.MPD;
	if (!mpd) throw new Error("Invalid MPD: missing root MPD element");

	const period = Array.isArray(mpd.Period) ? mpd.Period[0] : mpd.Period;
	if (!period) throw new Error("Invalid MPD: missing Period element");

	const adaptationSet = selectVideoAdaptationSet(period as Record<string, unknown>);
	if (!adaptationSet) throw new Error("Invalid MPD: missing video AdaptationSet");

	const representation = Array.isArray(adaptationSet.Representation)
		? (adaptationSet.Representation as unknown[])[0]
		: adaptationSet.Representation;
	if (!representation) throw new Error("Invalid MPD: missing Representation element");

	const rep = representation as Record<string, unknown>;
	const representationId: string = String(rep["@_id"] ?? "");
	if (!representationId) throw new Error("Invalid MPD: Representation missing id attribute");

	const width =
		Number(rep["@_width"] ?? (adaptationSet as Record<string, unknown>)["@_width"]) || 1920;
	const height =
		Number(rep["@_height"] ?? (adaptationSet as Record<string, unknown>)["@_height"]) || 1080;

	const st =
		(rep.SegmentTemplate as Record<string, unknown> | undefined) ??
		((adaptationSet as Record<string, unknown>).SegmentTemplate as
			| Record<string, unknown>
			| undefined);
	if (!st) throw new Error("Invalid MPD: missing SegmentTemplate");

	const timescale = Number(st["@_timescale"]);
	const duration = Number(st["@_duration"]);
	const startNumber = Number(st["@_startNumber"] ?? 1);
	const initialization: string = String(st["@_initialization"] ?? "");
	const media: string = String(st["@_media"] ?? "");

	if (!timescale || !duration || !initialization || !media) {
		throw new Error("Invalid MPD: SegmentTemplate missing required attributes");
	}

	// RFC3986 BaseURL resolution: resolve(period.BaseURL, resolve(mpd.BaseURL, mpdDocumentURL)).
	// presentationTimeOffset is parsed informationally only — segmentStartTimeMs (from /play)
	// remains the wall-clock anchor.
	const mpdBaseText = extractBaseUrl(mpd);
	const periodBaseText = extractBaseUrl(period);
	const mpdBase = new URL(mpdBaseText ?? "./", mpdUrl).toString();
	const periodBase = new URL(periodBaseText ?? "./", mpdBase).toString();
	// URL constructor drops the base's query when resolving a path-relative reference.
	// Preserve mpdUrl's query as a fallback so CDN session/auth query tokens reach segment URLs.
	const inheritedQuery = new URL(mpdUrl).search;

	return {
		id: representationId,
		width,
		height,
		segmentTemplate: {
			timescale,
			duration,
			startNumber,
			initialization,
			media,
		},
		mpdBase,
		periodBase,
		inheritedQuery,
	};
}

function resolveSegmentUrl(template: string, periodBase: string, inheritedQuery: string): string {
	const u = new URL(template, periodBase);
	if (!u.search && inheritedQuery) u.search = inheritedQuery;
	return u.toString();
}

// ISO/IEC 23009-1 $Number$ / $Number%0Nd$ width-format spec.
function substituteTemplate(template: string, id: string, number?: number): string {
	let result = template.replace(/\$RepresentationID\$/g, id);
	if (number !== undefined) {
		const n = String(number);
		result = result.replace(/\$Number(?:%0(\d+)d)?\$/g, (_m, width: string | undefined) =>
			width ? n.padStart(Number(width), "0") : n,
		);
	}
	return result;
}

export function generateHlsPlaylist(input: MpdToHlsInput): MpdToHlsOutput {
	const { mpdXml, mpdUrl, segmentStartTimeMs, requestedStartMs, requestedEndMs, maxDurationMs } =
		input;

	if (requestedEndMs <= requestedStartMs) {
		throw new Error("requestedEndMs must be greater than requestedStartMs");
	}

	const requestedDurationMs = requestedEndMs - requestedStartMs;
	if (maxDurationMs !== undefined && requestedDurationMs > maxDurationMs) {
		throw new Error(
			`Requested duration ${requestedDurationMs}ms exceeds maximum ${maxDurationMs}ms`,
		);
	}

	const {
		id,
		width,
		height,
		segmentTemplate: st,
		periodBase,
		inheritedQuery,
	} = parseMpd(mpdXml, mpdUrl);

	const segDurationMs = (st.duration / st.timescale) * 1000;
	const segDurationS = st.duration / st.timescale;

	const firstSegIdx = Math.max(
		0,
		Math.floor((requestedStartMs - segmentStartTimeMs) / segDurationMs),
	);
	const firstSegNumber = st.startNumber + firstSegIdx;
	const firstSegStartMs = segmentStartTimeMs + firstSegIdx * segDurationMs;

	const sourceOffsetMs = Math.max(0, requestedStartMs - firstSegStartMs);

	const lastSegIdx = Math.max(
		firstSegIdx,
		Math.floor((requestedEndMs - segmentStartTimeMs - 1) / segDurationMs),
	);
	const lastSegNumber = st.startNumber + lastSegIdx;

	const segCount = lastSegIdx - firstSegIdx + 1;
	if (segCount > 10_000) {
		throw new Error(
			`Segment count ${segCount} exceeds maximum 10000. Check that requestedEndMs and segmentStartTimeMs use the same time reference.`,
		);
	}

	const initUri = resolveSegmentUrl(
		substituteTemplate(st.initialization, id),
		periodBase,
		inheritedQuery,
	);

	// MEDIA-SEQUENCE must be 0: mediabunny's HLS demuxer offsets the first
	// segment's timestamp by `MEDIA-SEQUENCE * TARGETDURATION` when no
	// PROGRAM-DATE-TIME tag is present, which would push all timestamps far
	// past the player's seek range and prevent any segment after the first
	// from being fetched.
	const lines: string[] = [
		"#EXTM3U",
		"#EXT-X-VERSION:7",
		`#EXT-X-TARGETDURATION:${Math.ceil(segDurationS)}`,
		"#EXT-X-MEDIA-SEQUENCE:0",
		"#EXT-X-PLAYLIST-TYPE:VOD",
		`#EXT-X-MAP:URI="${initUri}"`,
	];

	for (let n = firstSegNumber; n <= lastSegNumber; n++) {
		const segUri = resolveSegmentUrl(
			substituteTemplate(st.media, id, n),
			periodBase,
			inheritedQuery,
		);
		lines.push(`#EXTINF:${segDurationS.toFixed(3)},`);
		lines.push(segUri);
	}

	lines.push("#EXT-X-ENDLIST");

	return {
		playlist: `${lines.join("\n")}\n`,
		sourceOffsetMs,
		durationMs: requestedDurationMs,
		width,
		height,
	};
}
