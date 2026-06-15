import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface FixtureImage {
	contentType: string;
	body: Buffer;
}

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/images");
const IDS = ["img-001", "img-002", "img-003", "screenshot-001"] as const;

export const imageFixtures: Record<string, FixtureImage> = Object.fromEntries(
	IDS.map((id) => [
		id,
		{ contentType: "image/jpeg", body: readFileSync(join(fixtureRoot, `${id}.jpg`)) },
	]),
);
