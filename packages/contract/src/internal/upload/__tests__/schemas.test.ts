import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSignedUrlBodySchema } from "../schemas.js";

describe("getSignedUrlBodySchema", () => {
	it("rejects empty filename", () => {
		assert.equal(
			getSignedUrlBodySchema.safeParse({ filename: "", mimetype: "video/mp4", size: 1 }).success,
			false,
		);
	});

	it("rejects empty mimetype", () => {
		assert.equal(
			getSignedUrlBodySchema.safeParse({ filename: "a.mp4", mimetype: "", size: 1 }).success,
			false,
		);
	});

	it("rejects missing size", () => {
		assert.equal(
			getSignedUrlBodySchema.safeParse({ filename: "a.mp4", mimetype: "video/mp4" }).success,
			false,
		);
	});

	it("rejects zero or negative size", () => {
		assert.equal(
			getSignedUrlBodySchema.safeParse({ filename: "a.mp4", mimetype: "video/mp4", size: 0 })
				.success,
			false,
		);
		assert.equal(
			getSignedUrlBodySchema.safeParse({ filename: "a.mp4", mimetype: "video/mp4", size: -1 })
				.success,
			false,
		);
	});

	it("accepts non-empty filename, mimetype, and positive size", () => {
		assert.equal(
			getSignedUrlBodySchema.safeParse({
				filename: "a.mp4",
				mimetype: "video/mp4",
				size: 1024,
			}).success,
			true,
		);
	});
});
