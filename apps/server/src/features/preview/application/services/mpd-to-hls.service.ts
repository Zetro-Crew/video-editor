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
	duration: number | undefined;
	startNumber: number;
	initialization: string;
	media: string;
}

interface Segment {
	number: number;
	startMs: number;
	durationMs: number;
}

interface ParsedRepresentation {
	id: string;
	width: number;
	height: number;
	segmentTemplate: SegmentTemplate;
	timelineSegments: Segment[] | undefined;
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
	const durationAttr = st["@_duration"];
	const duration = durationAttr === undefined ? undefined : Number(durationAttr);
	const startNumber = Number(st["@_startNumber"] ?? 1);
	const initialization: string = String(st["@_initialization"] ?? "");
	const media: string = String(st["@_media"] ?? "");

	const timelineSegments = expandSegmentTimeline(st.SegmentTimeline, timescale, startNumber);

	if (!timescale || !initialization || !media) {
		throw new Error("Invalid MPD: SegmentTemplate missing required attributes");
	}
	if (!timelineSegments && (duration === undefined || !duration)) {
		throw new Error("Invalid MPD: SegmentTemplate needs either SegmentTimeline or @duration");
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
		timelineSegments,
		mpdBase,
		periodBase,
		inheritedQuery,
	};
}

function expandSegmentTimeline(
	timelineNode: unknown,
	timescale: number,
	startNumber: number,
): Segment[] | undefined {
	if (!timelineNode || typeof timelineNode !== "object") return undefined;
	const sEntries = (timelineNode as { S?: unknown }).S;
	const list = Array.isArray(sEntries) ? sEntries : sEntries !== undefined ? [sEntries] : [];
	if (list.length === 0) return undefined;

	const segments: Segment[] = [];
	let cursorTicks = 0;
	let nextNumber = startNumber;

	for (const sUnknown of list) {
		if (!sUnknown || typeof sUnknown !== "object") continue;
		const s = sUnknown as Record<string, unknown>;
		const dAttr = s["@_d"];
		if (dAttr === undefined) {
			throw new Error("Invalid MPD: SegmentTimeline.S missing required @d");
		}
		const d = Number(dAttr);
		if (!Number.isFinite(d) || d <= 0) {
			throw new Error("Invalid MPD: SegmentTimeline.S has invalid @d");
		}
		const tAttr = s["@_t"];
		if (tAttr !== undefined) {
			const t = Number(tAttr);
			if (!Number.isFinite(t) || t < 0) {
				throw new Error("Invalid MPD: SegmentTimeline.S has invalid @t");
			}
			cursorTicks = t;
		}
		const rAttr = s["@_r"];
		const r = rAttr === undefined ? 0 : Number(rAttr);
		if (!Number.isInteger(r)) {
			throw new Error("Invalid MPD: SegmentTimeline.S @r must be an integer");
		}
		if (r < 0) {
			throw new Error("Invalid MPD: SegmentTimeline.S @r=-1 (unbounded repeat) is not supported");
		}
		const repeatCount = r + 1;
		for (let i = 0; i < repeatCount; i++) {
			segments.push({
				number: nextNumber++,
				startMs: (cursorTicks / timescale) * 1000,
				durationMs: (d / timescale) * 1000,
			});
			cursorTicks += d;
		}
	}

	return segments.length > 0 ? segments : undefined;
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
		timelineSegments,
		periodBase,
		inheritedQuery,
	} = parseMpd(mpdXml, mpdUrl);

	const { selected, sourceOffsetMs } = timelineSegments
		? selectTimelineSegments(timelineSegments, segmentStartTimeMs, requestedStartMs, requestedEndMs)
		: selectUniformSegments(st, segmentStartTimeMs, requestedStartMs, requestedEndMs);

	const initUri = resolveSegmentUrl(
		substituteTemplate(st.initialization, id),
		periodBase,
		inheritedQuery,
	);

	const targetDurationS = Math.ceil(
		selected.reduce((max, seg) => Math.max(max, seg.durationMs), 0) / 1000,
	);

	// MEDIA-SEQUENCE must be 0: mediabunny's HLS demuxer offsets the first
	// segment's timestamp by `MEDIA-SEQUENCE * TARGETDURATION` when no
	// PROGRAM-DATE-TIME tag is present, which would push all timestamps far
	// past the player's seek range and prevent any segment after the first
	// from being fetched.
	const lines: string[] = [
		"#EXTM3U",
		"#EXT-X-VERSION:7",
		`#EXT-X-TARGETDURATION:${targetDurationS}`,
		"#EXT-X-MEDIA-SEQUENCE:0",
		"#EXT-X-PLAYLIST-TYPE:VOD",
		`#EXT-X-MAP:URI="${initUri}"`,
	];

	for (const seg of selected) {
		const segUri = resolveSegmentUrl(
			substituteTemplate(st.media, id, seg.number),
			periodBase,
			inheritedQuery,
		);
		lines.push(`#EXTINF:${(seg.durationMs / 1000).toFixed(3)},`);
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

function selectTimelineSegments(
	allSegments: Segment[],
	segmentStartTimeMs: number,
	requestedStartMs: number,
	requestedEndMs: number,
): { selected: Segment[]; sourceOffsetMs: number } {
	const relStart = requestedStartMs - segmentStartTimeMs;
	const relEnd = requestedEndMs - segmentStartTimeMs;

	let firstIdx = -1;
	for (let i = 0; i < allSegments.length; i++) {
		if (allSegments[i].startMs > relStart) break;
		firstIdx = i;
	}
	if (firstIdx < 0) firstIdx = 0;

	let lastIdx = firstIdx;
	for (let i = firstIdx; i < allSegments.length; i++) {
		if (allSegments[i].startMs >= relEnd) break;
		lastIdx = i;
	}

	const selected = allSegments.slice(firstIdx, lastIdx + 1);
	const sourceOffsetMs = Math.max(0, relStart - selected[0].startMs);
	return { selected, sourceOffsetMs };
}

function selectUniformSegments(
	st: SegmentTemplate,
	segmentStartTimeMs: number,
	requestedStartMs: number,
	requestedEndMs: number,
): { selected: Segment[]; sourceOffsetMs: number } {
	if (st.duration === undefined) {
		throw new Error("Invalid MPD: SegmentTemplate@duration missing");
	}
	const segDurationMs = (st.duration / st.timescale) * 1000;

	const firstSegIdx = Math.max(
		0,
		Math.floor((requestedStartMs - segmentStartTimeMs) / segDurationMs),
	);
	const firstSegStartMs = firstSegIdx * segDurationMs;
	const sourceOffsetMs = Math.max(0, requestedStartMs - segmentStartTimeMs - firstSegStartMs);

	const lastSegIdx = Math.max(
		firstSegIdx,
		Math.floor((requestedEndMs - segmentStartTimeMs - 1) / segDurationMs),
	);

	const segCount = lastSegIdx - firstSegIdx + 1;
	if (segCount > 10_000) {
		throw new Error(
			`Segment count ${segCount} exceeds maximum 10000. Check that requestedEndMs and segmentStartTimeMs use the same time reference.`,
		);
	}

	const selected: Segment[] = [];
	for (let i = 0; i < segCount; i++) {
		selected.push({
			number: st.startNumber + firstSegIdx + i,
			startMs: firstSegStartMs + i * segDurationMs,
			durationMs: segDurationMs,
		});
	}
	return { selected, sourceOffsetMs };
}
