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
});
