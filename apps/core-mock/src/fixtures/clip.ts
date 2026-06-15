import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/clip");
let cached: Promise<Buffer> | undefined;

export function getDemoClipMp4(): Promise<Buffer> {
	if (!cached) {
		cached = readFile(join(fixtureRoot, "demo-clip-001.mp4"));
		cached.catch(() => {
			cached = undefined;
		});
	}
	return cached;
}
