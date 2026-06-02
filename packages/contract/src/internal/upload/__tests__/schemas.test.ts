import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSignedUrlBodySchema } from "../schemas.js";

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
