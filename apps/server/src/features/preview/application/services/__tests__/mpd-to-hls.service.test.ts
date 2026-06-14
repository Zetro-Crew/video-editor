import { describe, expect, it } from "vitest";
import { generateHlsPlaylist } from "../mpd-to-hls.service.ts";

const SEG_DURATION_MS = 15_000;
const SEGMENT_START_MS = 1_778_412_270_000;

const realShapeMpd = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"
	mediaPresentationDuration="PT2M50S" minBufferTime="PT1.0S"
	type="static" profiles="urn:mpeg:dash:profile:full:2011">
	<Period id="P0" duration="PT2M50S">
		<AdaptationSet segmentAlignment="true" bitstreamSwitching="false" contentType="video">
			<SegmentTemplate timescale="1000" duration="15000"
				media="segment_$RepresentationID$_$Number$.m4s"
				initialization="$RepresentationID$_init.mp4"
				startNumber="2362" presentationTimeOffset="3189060000"/>
			<Representation id="v4" codecs="avc1.42c020" mimeType="video/mp4"
				width="1280" height="1024" bandwidth="6000000"/>
		</AdaptationSet>
		<BaseURL>metzuda/pp-20021/49f7be53/</BaseURL>
	</Period>
	<BaseURL>media/</BaseURL>
</MPD>`;

const singleAdaptationMpd = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" profiles="urn:mpeg:dash:profile:isoff-live:2011">
	<Period id="0">
		<AdaptationSet id="0" contentType="video" startWithSAP="1">
			<Representation id="0" mimeType="video/mp4" codecs="avc1.64001f" bandwidth="149850" width="1280" height="720">
				<SegmentTemplate timescale="1000000" duration="15000000" initialization="$RepresentationID$_init.mp4" media="segment_$RepresentationID$_$Number$.m4s" startNumber="1"/>
			</Representation>
		</AdaptationSet>
	</Period>
</MPD>`;

describe("generateHlsPlaylist — SegmentTimeline", () => {
	const timelineOnlyMpd = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" profiles="urn:mpeg:dash:profile:full:2011">
	<Period id="P0">
		<AdaptationSet contentType="video" segmentAlignment="true">
			<SegmentTemplate timescale="1000" startNumber="100"
				media="seg_$RepresentationID$_$Number$.m4s"
				initialization="$RepresentationID$_init.mp4">
				<SegmentTimeline>
					<S t="0" d="15000"/>
					<S d="15000"/>
					<S d="15000"/>
					<S d="15000"/>
				</SegmentTimeline>
			</SegmentTemplate>
			<Representation id="v1" mimeType="video/mp4" width="1280" height="720" bandwidth="100000"/>
		</AdaptationSet>
	</Period>
</MPD>`;

	it("selects first/last segments by per-segment startMs when timeline has variable durations", () => {
		// Timeline: seg1 [0,10s) dur=10s, seg2 [10,30s) dur=20s, seg3 [30,35s) dur=5s, seg4 [35,50s) dur=15s.
		const variableMpd = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
	<Period id="P0">
		<AdaptationSet contentType="video">
			<SegmentTemplate timescale="1000" startNumber="10"
				media="seg_$RepresentationID$_$Number$.m4s"
				initialization="$RepresentationID$_init.mp4">
				<SegmentTimeline>
					<S t="0" d="10000"/>
					<S d="20000"/>
					<S d="5000"/>
					<S d="15000"/>
				</SegmentTimeline>
			</SegmentTemplate>
			<Representation id="v" mimeType="video/mp4" width="640" height="360" bandwidth="100000"/>
		</AdaptationSet>
	</Period>
</MPD>`;

		// requestedStart at relative 25s → falls inside seg2 [10,30s); first picked = seg2 (#11).
		// requestedEnd at relative 32s → falls inside seg3 [30,35s); last picked = seg3 (#12).
		const out = generateHlsPlaylist({
			mpdXml: variableMpd,
			mpdUrl: "https://vod.example.com/manifest.mpd",
			segmentStartTimeMs: SEGMENT_START_MS,
			requestedStartMs: SEGMENT_START_MS + 25_000,
			requestedEndMs: SEGMENT_START_MS + 32_000,
		});

		const extinfLines = out.playlist.split("\n").filter((l) => l.startsWith("#EXTINF:"));
		expect(extinfLines).toEqual(["#EXTINF:20.000,", "#EXTINF:5.000,"]);
		expect(out.playlist).toContain("seg_v_11.m4s");
		expect(out.playlist).toContain("seg_v_12.m4s");
		expect(out.playlist).not.toContain("seg_v_10.m4s");
		expect(out.playlist).not.toContain("seg_v_13.m4s");
		// sourceOffsetMs = 25000 - 10000 (seg2 start) = 15000
		expect(out.sourceOffsetMs).toBe(15_000);
		// TARGETDURATION rounded up from the max selected segment duration (20s here).
		expect(out.playlist).toContain("#EXT-X-TARGETDURATION:20");
	});

	it("throws a clear error when SegmentTimeline.S uses @r=-1 (unbounded repeat)", () => {
		const unboundedMpd = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
	<Period id="P0">
		<AdaptationSet contentType="video">
			<SegmentTemplate timescale="1000" startNumber="1"
				media="seg_$RepresentationID$_$Number$.m4s"
				initialization="$RepresentationID$_init.mp4">
				<SegmentTimeline>
					<S t="0" d="15000" r="-1"/>
				</SegmentTimeline>
			</SegmentTemplate>
			<Representation id="v" mimeType="video/mp4" width="640" height="360" bandwidth="100000"/>
		</AdaptationSet>
	</Period>
</MPD>`;

		expect(() =>
			generateHlsPlaylist({
				mpdXml: unboundedMpd,
				mpdUrl: "https://vod.example.com/manifest.mpd",
				segmentStartTimeMs: SEGMENT_START_MS,
				requestedStartMs: SEGMENT_START_MS,
				requestedEndMs: SEGMENT_START_MS + SEG_DURATION_MS,
			}),
		).toThrow(/unbounded repeat/i);
	});

	it("inherits prev-end as next segment's start when @t is omitted, and resets when @t is provided", () => {
		// 3 segments of 10s, gap (no real segment between), then explicit @t=40000 (5s gap of nothing),
		// then 2 more segments of 10s. Selection at relStart=35000 (inside the gap) should pick
		// the seg at startMs=20000 (last seg whose start ≤ 35000) — i.e. the third seg of the first group.
		const sparseMpd = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
	<Period id="P0">
		<AdaptationSet contentType="video">
			<SegmentTemplate timescale="1000" startNumber="1"
				media="seg_$RepresentationID$_$Number$.m4s"
				initialization="$RepresentationID$_init.mp4">
				<SegmentTimeline>
					<S t="0" d="10000"/>
					<S d="10000"/>
					<S d="10000"/>
					<S t="40000" d="10000"/>
					<S d="10000"/>
				</SegmentTimeline>
			</SegmentTemplate>
			<Representation id="v" mimeType="video/mp4" width="640" height="360" bandwidth="100000"/>
		</AdaptationSet>
	</Period>
</MPD>`;

		const out = generateHlsPlaylist({
			mpdXml: sparseMpd,
			mpdUrl: "https://vod.example.com/manifest.mpd",
			segmentStartTimeMs: SEGMENT_START_MS,
			// requestedStart = 35s into the relative timeline → expect first selected seg = seg#3 (startMs=20000)
			requestedStartMs: SEGMENT_START_MS + 35_000,
			requestedEndMs: SEGMENT_START_MS + 60_000,
		});

		// Expect seg#3 (startMs 20000, dur 10000), seg#4 (startMs 40000), seg#5 (startMs 50000)
		expect(out.playlist).toContain("seg_v_3.m4s");
		expect(out.playlist).toContain("seg_v_4.m4s");
		expect(out.playlist).toContain("seg_v_5.m4s");
		// sourceOffsetMs = 35000 - 20000 = 15000
		expect(out.sourceOffsetMs).toBe(15_000);
	});

	it("uses SegmentTimeline durations even when @duration is also present (DASH spec precedence)", () => {
		// @duration claims 150s per segment; SegmentTimeline says actually 15s.
		// Without per-S parsing, code would emit EXTINF:150.000 — the closed-network bug.
		const mixedMpd = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
	<Period id="P0">
		<AdaptationSet contentType="video">
			<SegmentTemplate timescale="1000" duration="150000" startNumber="1"
				media="seg_$RepresentationID$_$Number$.m4s"
				initialization="$RepresentationID$_init.mp4">
				<SegmentTimeline>
					<S t="0" d="15000" r="3"/>
				</SegmentTimeline>
			</SegmentTemplate>
			<Representation id="v" mimeType="video/mp4" width="640" height="360" bandwidth="100000"/>
		</AdaptationSet>
	</Period>
</MPD>`;

		const out = generateHlsPlaylist({
			mpdXml: mixedMpd,
			mpdUrl: "https://vod.example.com/manifest.mpd",
			segmentStartTimeMs: SEGMENT_START_MS,
			requestedStartMs: SEGMENT_START_MS,
			requestedEndMs: SEGMENT_START_MS + 4 * SEG_DURATION_MS,
		});

		const extinfLines = out.playlist.split("\n").filter((l) => l.startsWith("#EXTINF:"));
		expect(extinfLines).toEqual([
			"#EXTINF:15.000,",
			"#EXTINF:15.000,",
			"#EXTINF:15.000,",
			"#EXTINF:15.000,",
		]);
	});

	it("expands <S r=N/> to N+1 segments at the same duration", () => {
		const repeatMpd = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
	<Period id="P0">
		<AdaptationSet contentType="video">
			<SegmentTemplate timescale="1000" startNumber="1"
				media="seg_$RepresentationID$_$Number$.m4s"
				initialization="$RepresentationID$_init.mp4">
				<SegmentTimeline>
					<S t="0" d="15000" r="3"/>
				</SegmentTimeline>
			</SegmentTemplate>
			<Representation id="v" mimeType="video/mp4" width="640" height="360" bandwidth="100000"/>
		</AdaptationSet>
	</Period>
</MPD>`;

		const out = generateHlsPlaylist({
			mpdXml: repeatMpd,
			mpdUrl: "https://vod.example.com/manifest.mpd",
			segmentStartTimeMs: SEGMENT_START_MS,
			requestedStartMs: SEGMENT_START_MS,
			requestedEndMs: SEGMENT_START_MS + 4 * SEG_DURATION_MS,
		});

		const extinfLines = out.playlist.split("\n").filter((l) => l.startsWith("#EXTINF:"));
		expect(extinfLines).toHaveLength(4);
		expect(out.playlist).toContain("seg_v_1.m4s");
		expect(out.playlist).toContain("seg_v_4.m4s");
	});

	it("emits EXTINF lines matching each <S d=…> when SegmentTimeline is present without @duration", () => {
		const out = generateHlsPlaylist({
			mpdXml: timelineOnlyMpd,
			mpdUrl: "https://vod.example.com/manifest.mpd",
			segmentStartTimeMs: SEGMENT_START_MS,
			requestedStartMs: SEGMENT_START_MS,
			requestedEndMs: SEGMENT_START_MS + 4 * SEG_DURATION_MS,
		});

		const extinfLines = out.playlist.split("\n").filter((l) => l.startsWith("#EXTINF:"));
		expect(extinfLines).toEqual([
			"#EXTINF:15.000,",
			"#EXTINF:15.000,",
			"#EXTINF:15.000,",
			"#EXTINF:15.000,",
		]);
		expect(out.playlist).toContain("seg_v1_100.m4s");
		expect(out.playlist).toContain("seg_v1_103.m4s");
	});
});

describe("generateHlsPlaylist — BaseURL resolution (RFC3986)", () => {
	it("resolves segments against MPD <BaseURL> + Period <BaseURL> chain (real-prod MPD shape)", () => {
		const out = generateHlsPlaylist({
			mpdXml: realShapeMpd,
			mpdUrl: "https://vod.example.com/api/manifest.mpd",
			segmentStartTimeMs: SEGMENT_START_MS,
			requestedStartMs: SEGMENT_START_MS,
			requestedEndMs: SEGMENT_START_MS + SEG_DURATION_MS,
		});

		expect(out.playlist).toContain(
			'#EXT-X-MAP:URI="https://vod.example.com/api/media/metzuda/pp-20021/49f7be53/v4_init.mp4"',
		);
		expect(out.playlist).toContain(
			"https://vod.example.com/api/media/metzuda/pp-20021/49f7be53/segment_v4_2362.m4s",
		);
	});

	it("falls back to mpdUrl when MPD has no <BaseURL>", () => {
		const out = generateHlsPlaylist({
			mpdXml: singleAdaptationMpd,
			mpdUrl: "https://host.example.com/path/manifest.mpd",
			segmentStartTimeMs: SEGMENT_START_MS,
			requestedStartMs: SEGMENT_START_MS,
			requestedEndMs: SEGMENT_START_MS + SEG_DURATION_MS,
		});

		expect(out.playlist).toContain('#EXT-X-MAP:URI="https://host.example.com/path/0_init.mp4"');
		expect(out.playlist).toContain("https://host.example.com/path/segment_0_1.m4s");
	});

	it("preserves mpdUrl query string on segment URLs when no BaseURL provides its own", () => {
		const out = generateHlsPlaylist({
			mpdXml: singleAdaptationMpd,
			mpdUrl: "https://host.example.com/path/manifest.mpd?session=abc&tenant=z",
			segmentStartTimeMs: SEGMENT_START_MS,
			requestedStartMs: SEGMENT_START_MS,
			requestedEndMs: SEGMENT_START_MS + SEG_DURATION_MS,
		});

		expect(out.playlist).toContain(
			'#EXT-X-MAP:URI="https://host.example.com/path/0_init.mp4?session=abc&tenant=z"',
		);
		expect(out.playlist).toContain(
			"https://host.example.com/path/segment_0_1.m4s?session=abc&tenant=z",
		);
	});
});

describe("generateHlsPlaylist — AdaptationSet selection", () => {
	const imageFirstMpd = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" profiles="urn:mpeg:dash:profile:full:2011">
	<Period id="P0">
		<AdaptationSet contentType="image" mimeType="image/jpg">
			<SegmentTemplate timescale="1000" duration="75000" media="$Number$.tile" startNumber="472"/>
			<Representation height="90" width="2400" id="t1"/>
		</AdaptationSet>
		<AdaptationSet contentType="video">
			<SegmentTemplate timescale="1000" duration="15000"
				media="segment_$RepresentationID$_$Number$.m4s"
				initialization="$RepresentationID$_init.mp4"
				startNumber="100"/>
			<Representation id="v4" mimeType="video/mp4" width="1280" height="720" bandwidth="6000000"/>
		</AdaptationSet>
	</Period>
</MPD>`;

	const noVideoMpd = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
	<Period id="P0">
		<AdaptationSet contentType="image" mimeType="image/jpg">
			<SegmentTemplate timescale="1000" duration="75000" media="$Number$.tile" startNumber="472"/>
			<Representation height="90" width="2400" id="t1"/>
		</AdaptationSet>
	</Period>
</MPD>`;

	it("picks video AdaptationSet when image AdaptationSet appears first", () => {
		const out = generateHlsPlaylist({
			mpdXml: imageFirstMpd,
			mpdUrl: "https://vod/manifest.mpd",
			segmentStartTimeMs: SEGMENT_START_MS,
			requestedStartMs: SEGMENT_START_MS,
			requestedEndMs: SEGMENT_START_MS + SEG_DURATION_MS,
		});

		expect(out.playlist).toContain("segment_v4_100.m4s");
		expect(out.playlist).not.toContain(".tile");
		expect(out.width).toBe(1280);
		expect(out.height).toBe(720);
	});

	it("throws when no video AdaptationSet present", () => {
		expect(() =>
			generateHlsPlaylist({
				mpdXml: noVideoMpd,
				mpdUrl: "https://vod/manifest.mpd",
				segmentStartTimeMs: SEGMENT_START_MS,
				requestedStartMs: SEGMENT_START_MS,
				requestedEndMs: SEGMENT_START_MS + SEG_DURATION_MS,
			}),
		).toThrow(/video AdaptationSet/i);
	});

	it("accepts non-numeric Representation id", () => {
		const out = generateHlsPlaylist({
			mpdXml: realShapeMpd,
			mpdUrl: "https://vod/manifest.mpd",
			segmentStartTimeMs: SEGMENT_START_MS,
			requestedStartMs: SEGMENT_START_MS,
			requestedEndMs: SEGMENT_START_MS + SEG_DURATION_MS,
		});
		expect(out.playlist).toContain("v4_init.mp4");
	});

	it("accepts AdaptationSet without contentType when Representation declares video mimeType", () => {
		const repOnlyMpd = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
	<Period id="P0">
		<AdaptationSet startWithSAP="1">
			<SegmentTemplate timescale="1000" duration="15000"
				media="segment_$RepresentationID$_$Number$.m4s"
				initialization="$RepresentationID$_init.mp4"
				startNumber="1"/>
			<Representation id="v" mimeType="video/mp4" width="640" height="360" bandwidth="100000"/>
		</AdaptationSet>
	</Period>
</MPD>`;
		const out = generateHlsPlaylist({
			mpdXml: repOnlyMpd,
			mpdUrl: "https://vod/manifest.mpd",
			segmentStartTimeMs: SEGMENT_START_MS,
			requestedStartMs: SEGMENT_START_MS,
			requestedEndMs: SEGMENT_START_MS + SEG_DURATION_MS,
		});
		expect(out.playlist).toContain("segment_v_1.m4s");
		expect(out.width).toBe(640);
	});
});

describe("generateHlsPlaylist — playback compatibility (mediabunny)", () => {
	// mediabunny's HLS demuxer (hls-segmented-input.js) shifts the first segment's
	// timestamp by `EXT-X-MEDIA-SEQUENCE * EXTINF` when no PROGRAM-DATE-TIME tag is
	// present. Emitting MEDIA-SEQUENCE=startNumber (e.g. 2362) makes the demuxer
	// report all segment timestamps starting at ~9.85h, so Remotion's seek requests
	// for 0–30s never match and segments after the first are never fetched.
	// MEDIA-SEQUENCE must be 0 (the HLS default).
	it("emits EXT-X-MEDIA-SEQUENCE:0 regardless of source startNumber", () => {
		const out = generateHlsPlaylist({
			mpdXml: realShapeMpd,
			mpdUrl: "https://vod/manifest.mpd",
			segmentStartTimeMs: SEGMENT_START_MS,
			requestedStartMs: SEGMENT_START_MS,
			requestedEndMs: SEGMENT_START_MS + 2 * SEG_DURATION_MS,
		});

		expect(out.playlist).toContain("#EXT-X-MEDIA-SEQUENCE:0\n");
		expect(out.playlist).not.toMatch(/#EXT-X-MEDIA-SEQUENCE:(?!0\b)/);
	});

	it("references segment by source startNumber in URLs while sequence stays at 0", () => {
		const out = generateHlsPlaylist({
			mpdXml: realShapeMpd,
			mpdUrl: "https://vod.example.com/api/manifest.mpd",
			segmentStartTimeMs: SEGMENT_START_MS,
			requestedStartMs: SEGMENT_START_MS,
			requestedEndMs: SEGMENT_START_MS + 2 * SEG_DURATION_MS,
		});

		expect(out.playlist).toContain("segment_v4_2362.m4s");
		expect(out.playlist).toContain("segment_v4_2363.m4s");
		expect(out.playlist).toContain("#EXT-X-MEDIA-SEQUENCE:0\n");
	});
});
