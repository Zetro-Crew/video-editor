import { describe, expect, it } from "vitest";
import { signUrl, verifyUrlSignature } from "../url-signing.ts";

const SECRET = "test-secret-for-url-signing-32characters";

describe("url-signing", () => {
	it("verifies a freshly signed (url, token, srcKind=channel-range) tuple", () => {
		const sig = signUrl(SECRET, "https://vod/x.m4s", "tok-A", "channel-range");
		expect(verifyUrlSignature(SECRET, "https://vod/x.m4s", "tok-A", "channel-range", sig)).toBe(
			true,
		);
	});

	it("verifies a freshly signed media-id tuple (token may be empty)", () => {
		const sig = signUrl(SECRET, "https://core/storage/abc/seg.m4s", "", "media-id");
		expect(
			verifyUrlSignature(SECRET, "https://core/storage/abc/seg.m4s", "", "media-id", sig),
		).toBe(true);
	});

	it("rejects signature reuse across different srcKinds (binds kind to sig)", () => {
		const sig = signUrl(SECRET, "https://vod/x.m4s", "tok-A", "channel-range");
		expect(verifyUrlSignature(SECRET, "https://vod/x.m4s", "tok-A", "media-id", sig)).toBe(false);
	});

	it("rejects signature reuse across different tokens (binds token to sig)", () => {
		const sig = signUrl(SECRET, "https://vod/x.m4s", "tok-A", "channel-range");
		expect(verifyUrlSignature(SECRET, "https://vod/x.m4s", "tok-B", "channel-range", sig)).toBe(
			false,
		);
	});

	it("rejects signature reuse across different urls", () => {
		const sig = signUrl(SECRET, "https://vod/x.m4s", "tok-A", "channel-range");
		expect(verifyUrlSignature(SECRET, "https://vod/y.m4s", "tok-A", "channel-range", sig)).toBe(
			false,
		);
	});

	it("returns false for empty sig", () => {
		expect(verifyUrlSignature(SECRET, "https://vod/x.m4s", "tok-A", "channel-range", "")).toBe(
			false,
		);
	});
});
