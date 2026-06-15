import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("package.json subpath exports", () => {
	const subpaths = [
		"@video-editor/contract/iframe/from-parent",
		"@video-editor/contract/iframe/to-parent",
		"@video-editor/contract/events",
		"@video-editor/contract/internal/edit-video",
		"@video-editor/contract/internal/preview",
		"@video-editor/contract/internal/render",
		"@video-editor/contract/internal/upload",
		"@video-editor/contract/internal/shared",
	];

	for (const sub of subpaths) {
		it(`resolves ${sub}`, async () => {
			const mod = await import(sub);
			assert.equal(typeof mod, "object");
			assert.notEqual(mod, null);
		});
	}
});
