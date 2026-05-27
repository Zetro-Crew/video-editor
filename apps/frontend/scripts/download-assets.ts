import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

const ROOT = new URL("../public", import.meta.url).pathname;

const DIRS = [`${ROOT}/fonts`];

for (const dir of DIRS) {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function download(url: string, dest: string): Promise<void> {
	const res = await fetch(url);
	if (!res.ok) {
		console.error(`  FAIL ${res.status} ${url}`);
		return;
	}
	await finished(Readable.fromWeb(res.body as never).pipe(createWriteStream(dest)));
	console.log(`  OK   ${basename(dest)}`);
}

// --- Google Fonts families ---
const FONT_FAMILIES = ["IBM Plex Sans Hebrew", "Roboto"];

console.log("\nDownloading editor fonts...");
console.log(`  Found ${FONT_FAMILIES.length} font families`);

for (const family of FONT_FAMILIES) {
	const encodedFamily = encodeURIComponent(family);
	const cssUrl = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@300;400;500;600;700&display=swap`;
	try {
		const res = await fetch(cssUrl, {
			headers: { "User-Agent": "Mozilla/5.0" },
		});
		if (!res.ok) continue;
		const css = await res.text();
		const ttfUrls = [...css.matchAll(/src: url\(([^)]+\.ttf)\)/g)].map((m) => m[1]);
		for (const ttfUrl of ttfUrls) {
			const filename = ttfUrl.split("/").at(-1) ?? basename(ttfUrl);
			await download(ttfUrl, `${ROOT}/fonts/${filename}`);
		}
	} catch {
		console.error(`  SKIP ${family}`);
	}
}

// --- Specific fonts by direct URL ---
console.log("\nDownloading specific fonts...");
const specificFonts: Array<{ url: string; dest: string }> = [
	{
		url: "https://cdn.designcombo.dev/fonts/Geist-SemiBold.ttf",
		dest: `${ROOT}/fonts/Geist-SemiBold.ttf`,
	},
	{
		url: "https://fonts.gstatic.com/s/roboto/v29/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf",
		dest: `${ROOT}/fonts/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf`,
	},
	{
		url: "https://cdn.designcombo.dev/fonts/the-bold-font.ttf",
		dest: `${ROOT}/fonts/the-bold-font.ttf`,
	},
];
for (const { url, dest } of specificFonts) {
	await download(url, dest);
}

console.log("\nDone. Fonts downloaded to public/fonts/");
