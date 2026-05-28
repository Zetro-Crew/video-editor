import { describe, expect, it } from "vitest";
import { validateMediaName } from "../validate-media-name";

describe("validateMediaName", () => {
	it("returns null for a valid name", () => {
		expect(validateMediaName("My Video")).toBeNull();
	});

	it("returns null for empty string (handled separately by isNameValid)", () => {
		expect(validateMediaName("")).toBeNull();
	});

	it("returns error when name exceeds 70 characters", () => {
		expect(validateMediaName("a".repeat(71))).not.toBeNull();
	});

	it("returns null for name exactly 70 characters", () => {
		expect(validateMediaName("a".repeat(70))).toBeNull();
	});

	it("returns error for backslash", () => {
		expect(validateMediaName("my\\video")).not.toBeNull();
	});

	it("returns error for forward slash", () => {
		expect(validateMediaName("my/video")).not.toBeNull();
	});

	it("returns error for colon", () => {
		expect(validateMediaName("my:video")).not.toBeNull();
	});

	it("returns error for question mark", () => {
		expect(validateMediaName("my?video")).not.toBeNull();
	});

	it("returns error for asterisk", () => {
		expect(validateMediaName("my*video")).not.toBeNull();
	});

	it("returns error for double quote", () => {
		expect(validateMediaName('my"video')).not.toBeNull();
	});

	it("allows Hebrew characters", () => {
		expect(validateMediaName("הסרטון שלי")).toBeNull();
	});

	it("allows spaces and hyphens", () => {
		expect(validateMediaName("my-video name")).toBeNull();
	});
});
