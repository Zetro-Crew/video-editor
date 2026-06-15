import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface DashFixture {
	mpd: Buffer;
	inits: Map<string, Buffer>;
	segments: Map<string, Buffer>;
}

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/dash");
const cache = new Map<string, Promise<DashFixture>>();

async function load(mediaId: string): Promise<DashFixture> {
	const dir = join(fixtureRoot, mediaId);
	const files = await readdir(dir);
	const inits = new Map<string, Buffer>();
	const segments = new Map<string, Buffer>();
	let mpd: Buffer | undefined;
	for (const file of files) {
		const data = await readFile(join(dir, file));
		if (file === "manifest.mpd") {
			mpd = data;
		} else if (/^init_v\d+\.mp4$/.test(file)) {
			inits.set(file, data);
		} else if (/^segment_v\d+_\d+\.m4s$/.test(file)) {
			segments.set(file, data);
		}
	}
	if (!mpd) throw new Error(`No manifest.mpd in fixture for ${mediaId}`);
	if (inits.size === 0) throw new Error(`No init segments in fixture for ${mediaId}`);
	if (segments.size === 0) throw new Error(`No media segments in fixture for ${mediaId}`);
	return { mpd, inits, segments };
}

export function getDashFixture(mediaId: string): Promise<DashFixture> {
	const cached = cache.get(mediaId);
	if (cached) return cached;
	const pending = load(mediaId);
	cache.set(mediaId, pending);
	pending.catch(() => cache.delete(mediaId));
	return pending;
}
