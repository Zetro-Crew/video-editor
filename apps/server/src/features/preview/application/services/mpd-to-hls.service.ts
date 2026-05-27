import { XMLParser } from "fast-xml-parser";

export interface MpdToHlsInput {
	mpdXml: string;
	/** Base URL of the MPD document — used to build the EXT-X-MAP URI for the init segment. */
	baseUrl: string;
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
}

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
});

function parseMpd(mpdXml: string): ParsedRepresentation {
	const doc = parser.parse(mpdXml);
	const mpd = doc.MPD;
	if (!mpd) throw new Error("Invalid MPD: missing root MPD element");

	const period = Array.isArray(mpd.Period) ? mpd.Period[0] : mpd.Period;
	if (!period) throw new Error("Invalid MPD: missing Period element");

	const adaptationSet = Array.isArray(period.AdaptationSet)
		? period.AdaptationSet[0]
		: period.AdaptationSet;
	if (!adaptationSet) throw new Error("Invalid MPD: missing AdaptationSet element");

	const representation = Array.isArray(adaptationSet.Representation)
		? adaptationSet.Representation[0]
		: adaptationSet.Representation;
	if (!representation) throw new Error("Invalid MPD: missing Representation element");

	const representationId: string = String(representation["@_id"] ?? "");
	if (!representationId) throw new Error("Invalid MPD: Representation missing id attribute");

	const width = Number(representation["@_width"] ?? adaptationSet["@_width"]) || 1920;
	const height = Number(representation["@_height"] ?? adaptationSet["@_height"]) || 1080;

	const st = representation.SegmentTemplate ?? adaptationSet.SegmentTemplate;
	if (!st) throw new Error("Invalid MPD: missing SegmentTemplate");

	const timescale = Number(st["@_timescale"]);
	const duration = Number(st["@_duration"]);
	const startNumber = Number(st["@_startNumber"] ?? 1);
	const initialization: string = String(st["@_initialization"] ?? "");
	const media: string = String(st["@_media"] ?? "");

	if (!timescale || !duration || !initialization || !media) {
		throw new Error("Invalid MPD: SegmentTemplate missing required attributes");
	}

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
	};
}

function substituteTemplate(template: string, id: string, number?: number): string {
	let result = template.replace(/\$RepresentationID\$/g, id);
	if (number !== undefined) {
		result = result.replace(/\$Number\$/g, String(number));
	}
	return result;
}

function ensureTrailingSlash(url: string): string {
	return url.endsWith("/") ? url : `${url}/`;
}

export function generateHlsPlaylist(input: MpdToHlsInput): MpdToHlsOutput {
	const { mpdXml, baseUrl, segmentStartTimeMs, requestedStartMs, requestedEndMs, maxDurationMs } =
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

	const { id, width, height, segmentTemplate: st } = parseMpd(mpdXml);

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

	const base = ensureTrailingSlash(baseUrl);
	const initUri = `${base}${substituteTemplate(st.initialization, id)}`;

	const lines: string[] = [
		"#EXTM3U",
		"#EXT-X-VERSION:7",
		`#EXT-X-TARGETDURATION:${Math.ceil(segDurationS)}`,
		`#EXT-X-MEDIA-SEQUENCE:${firstSegNumber}`,
		"#EXT-X-PLAYLIST-TYPE:VOD",
		`#EXT-X-MAP:URI="${initUri}"`,
	];

	for (let n = firstSegNumber; n <= lastSegNumber; n++) {
		const segUri = substituteTemplate(st.media, id, n);
		lines.push(`#EXTINF:${segDurationS.toFixed(3)},`);
		lines.push(`${base}${segUri}`);
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
