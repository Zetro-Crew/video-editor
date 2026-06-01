import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanupBodySchema, getSignedUrlBodySchema } from "../schemas.js";

describe("getSignedUrlBodySchema", () => {
	it("rejects empty filename", () => {
		assert.equal(
			getSignedUrlBodySchema.safeParse({ filename: "", mimetype: "video/mp4" }).success,
			false,
		);
	});

	it("rejects empty mimetype", () => {
		assert.equal(
			getSignedUrlBodySchema.safeParse({ filename: "a.mp4", mimetype: "" }).success,
			false,
		);
	});

	it("accepts non-empty filename and mimetype", () => {
		assert.equal(
			getSignedUrlBodySchema.safeParse({ filename: "a.mp4", mimetype: "video/mp4" }).success,
			true,
		);
	});
});

describe("cleanupBodySchema", () => {
	it("rejects an empty s3Keys array", () => {
		assert.equal(cleanupBodySchema.safeParse({ s3Keys: [] }).success, false);
	});

	it("rejects s3Keys containing empty strings", () => {
		assert.equal(cleanupBodySchema.safeParse({ s3Keys: [""] }).success, false);
	});

	it("accepts a single non-empty key", () => {
		assert.equal(cleanupBodySchema.safeParse({ s3Keys: ["k"] }).success, true);
	});
});
