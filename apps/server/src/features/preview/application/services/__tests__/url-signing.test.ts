import { describe, expect, it } from "vitest";
import { signUrl, verifyUrlSignature } from "../url-signing.ts";

const SECRET = "test-secret-for-url-signing-32characters";

describe("url-signing", () => {
	it("verifies a freshly signed (url, token) pair", () => {
		const sig = signUrl(SECRET, "https://vod/x.m4s", "tok-A");
		expect(verifyUrlSignature(SECRET, "https://vod/x.m4s", "tok-A", sig)).toBe(true);
	});

	it("rejects signature reuse across different tokens (binds token to sig)", () => {
		const sig = signUrl(SECRET, "https://vod/x.m4s", "tok-A");
		expect(verifyUrlSignature(SECRET, "https://vod/x.m4s", "tok-B", sig)).toBe(false);
	});

	it("rejects signature reuse across different urls", () => {
		const sig = signUrl(SECRET, "https://vod/x.m4s", "tok-A");
		expect(verifyUrlSignature(SECRET, "https://vod/y.m4s", "tok-A", sig)).toBe(false);
	});

	it("returns false for empty sig", () => {
		expect(verifyUrlSignature(SECRET, "https://vod/x.m4s", "tok-A", "")).toBe(false);
	});
});
