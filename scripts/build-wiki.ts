#!/usr/bin/env node
// Generate wiki/ pages from existing repo docs. Idempotent: tracks its outputs
// in wiki/.generated.json so hand-written pages are never touched.
//
// Usage: node scripts/build-wiki.ts   (or `pnpm wiki:build` from repo root)

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const WIKI_ROOT = join(REPO_ROOT, "wiki");
const MANIFEST_PATH = join(WIKI_ROOT, ".generated.json");

type Source =
	| { kind: "copy"; src: string; dst: string; transform?: (body: string) => string }
	| { kind: "compute"; dst: string; build: () => string };

type AdrSummary = { num: string; title: string; status: string; file: string };

// ── Transforms ───────────────────────────────────────────────────────────────

function stripRootReadmeHeader(body: string): string {
	// Remove the centered HTML logo block that GitLab wiki won't render nicely.
	return body.replace(/<p align="left">[\s\S]*?<\/p>\s*/m, "");
}

// GitLab Wiki routes `[X](path.md)` to the raw blob view, not the page renderer.
// Strip `.md` from relative Markdown link targets (preserving any `#anchor`).
function stripWikiMdExtensions(body: string): string {
	return body.replace(
		/\]\(((?!https?:|mailto:|#)[^)\s]+?)\.md(#[^)\s]*)?\)/g,
		"]($1$2)",
	);
}

function rewriteContextLinks(body: string): string {
	// CONTEXT.md → glossary.md. Rewrite ADR links to wiki structure.
	return body.replace(/\(docs\/adr\/(\d{4}-[^)]+)\.md\)/g, "(adr/$1)");
}

function rewriteArchitectureLinks(body: string): string {
	// docs/architecture.md sits at wiki/architecture/overview.md; sibling refs stay
	// (no cross-doc links present today, but apply the same ADR rewrite).
	return body.replace(/\(\.\.\/adr\/(\d{4}-[^)]+)\.md\)/g, "(adr/$1)");
}

function rewriteAppReadmeLinks(body: string): string {
	// Per-app/package READMEs may link to docs/adr/* (sibling repo paths) or
	// ../../packages/contract/src/events/README.md — keep relative semantics
	// reasonable in the wiki by rewriting common patterns; otherwise leave alone.
	return body
		.replace(/\(\.\.\/\.\.\/docs\/adr\/(\d{4}-[^)]+)\.md\)/g, "(../adr/$1)")
		.replace(/\(\.\/CLAUDE\.md\)/g, "(./)") // CLAUDE.md is not in the wiki; drop the link target
		.replace(/\(\.\.\/\.\.\/packages\/contract\/README\.md\)/g, "(./contract)")
		.replace(
			/\(\.\.\/\.\.\/packages\/contract\/src\/events\/README\.md\)/g,
			"(../../integrators/event-consumers)",
		);
}

// ── ADR index ────────────────────────────────────────────────────────────────

function parseAdr(file: string, body: string): AdrSummary {
	const titleLine = body.split("\n").find((l) => l.startsWith("# ")) ?? "";
	const title = titleLine.replace(/^#\s+/, "").trim() || file;
	const statusMatch =
		body.match(/^\*\*Status:\*\*\s*([^\n]+)/m) ??
		body.match(/^-\s*Status:\s*([^\n]+)/m) ??
		body.match(/^##\s*Status\s*\n\s*([^\n]+)/m);
	const status = (statusMatch?.[1] ?? "Unknown").trim();
	const numMatch = file.match(/^(\d{4})/);
	const num = numMatch?.[1] ?? "----";
	return { num, title, status, file };
}

function buildAdrIndex(): string {
	const dir = join(REPO_ROOT, "docs/adr");
	const files = readDir(dir)
		.filter((f) => /^\d{4}-.*\.md$/.test(f))
		.sort();
	const summaries = files.map((f) => parseAdr(f, readFileSync(join(dir, f), "utf8")));
	const rows = summaries
		.map(
			(s) =>
				`| ${s.num} | [${s.title}](./${s.file.replace(/\.md$/, "")}) | ${s.status} |`,
		)
		.join("\n");
	return [
		"# Architecture Decision Records",
		"",
		"Architectural decisions, with their context and trade-offs. Records are append-only — once accepted they are not edited; supersession is a new record.",
		"",
		"| # | Title | Status |",
		"|---|---|---|",
		rows,
		"",
	].join("\n");
}

// ── Sidebar + home ───────────────────────────────────────────────────────────

function buildSidebar(): string {
	return [
		"## Onboarding",
		"- [Getting Started](onboarding/getting-started)",
		"- [Repo Tour](onboarding/repo-tour)",
		"- [Dev Setup](onboarding/dev-setup)",
		"- [Workflow](onboarding/workflow)",
		"",
		"## Architecture",
		"- [Overview](architecture/overview)",
		"- [Glossary](architecture/glossary)",
		"- [ADRs](architecture/adr/index)",
		"- Apps & Packages",
		"  - [frontend](architecture/apps/frontend)",
		"  - [server](architecture/apps/server)",
		"  - [iframe-demo](architecture/apps/iframe-demo)",
		"  - [core-mock](architecture/apps/core-mock)",
		"  - [mock-vod](architecture/apps/mock-vod)",
		"  - [contract](architecture/apps/contract)",
		"  - [observability](architecture/apps/observability)",
		"",
		"## Integrators",
		"- [Iframe Integration](integrators/iframe-integration)",
		"- [Event Consumers](integrators/event-consumers)",
		"",
		"## Ops",
		"- [Deployment](ops/deployment)",
		"- [Monitoring](ops/monitoring)",
		"- [Runbooks](ops/runbooks)",
		"",
		"## Product",
		"- [Feature Overview](product/feature-overview)",
		"- [User Glossary](product/user-glossary)",
		"",
	].join("\n");
}

function buildHome(): string {
	return [
		"# Video Editor Wiki",
		"",
		"Documentation hub for the React Video Editor — a browser-based video editing system deployed in closed, air-gapped networks.",
		"",
		"## Pick your path",
		"",
		"- **[Onboarding](onboarding/getting-started)** — new to the project. Install, run, learn the repo.",
		"- **[Architecture](architecture/overview)** — system design, ADRs, per-app deep dives.",
		"- **[Integrators](integrators/iframe-integration)** — embedding the editor iframe and consuming AMQP events from your own service.",
		"- **[Ops](ops/deployment)** — deploying, monitoring, and operating the editor in production.",
		"- **[Product](product/feature-overview)** — what the editor does, in plain language.",
		"",
		"## About this wiki",
		"",
		"This wiki is generated from the repo's `wiki/` folder. Generated pages mirror the source-of-truth Markdown in the repo (`README.md`, `CONTEXT.md`, `docs/adr/`, per-app READMEs). Hand-written pages live alongside them. The generator (`scripts/build-wiki.ts`) is idempotent — it never overwrites hand-written pages.",
		"",
	].join("\n");
}

// ── Source list ──────────────────────────────────────────────────────────────

const SOURCES: Source[] = [
	// Home + sidebar
	{ kind: "compute", dst: "home.md", build: buildHome },
	{ kind: "compute", dst: "_sidebar.md", build: buildSidebar },

	// Onboarding
	{
		kind: "copy",
		src: "README.md",
		dst: "onboarding/getting-started.md",
		transform: stripRootReadmeHeader,
	},
	{ kind: "copy", src: "CLAUDE.md", dst: "onboarding/repo-tour.md" },
	{
		kind: "compute",
		dst: "onboarding/dev-setup.md",
		build: buildDevSetup,
	},
	{
		kind: "compute",
		dst: "onboarding/workflow.md",
		build: buildWorkflow,
	},

	// Architecture
	{
		kind: "copy",
		src: "docs/architecture.md",
		dst: "architecture/overview.md",
		transform: rewriteArchitectureLinks,
	},
	{
		kind: "copy",
		src: "CONTEXT.md",
		dst: "architecture/glossary.md",
		transform: rewriteContextLinks,
	},
	{ kind: "compute", dst: "architecture/adr/index.md", build: buildAdrIndex },
	// ADR files appended dynamically below.

	// Per-app / per-package pages
	{
		kind: "copy",
		src: "apps/frontend/README.md",
		dst: "architecture/apps/frontend.md",
		transform: rewriteAppReadmeLinks,
	},
	{
		kind: "copy",
		src: "apps/server/README.md",
		dst: "architecture/apps/server.md",
		transform: rewriteAppReadmeLinks,
	},
	{
		kind: "copy",
		src: "apps/iframe-demo/README.md",
		dst: "architecture/apps/iframe-demo.md",
		transform: rewriteAppReadmeLinks,
	},
	{
		kind: "copy",
		src: "apps/core-mock/README.md",
		dst: "architecture/apps/core-mock.md",
		transform: rewriteAppReadmeLinks,
	},
	{
		kind: "copy",
		src: "apps/mock-vod/README.md",
		dst: "architecture/apps/mock-vod.md",
		transform: rewriteAppReadmeLinks,
	},
	{
		kind: "copy",
		src: "packages/contract/README.md",
		dst: "architecture/apps/contract.md",
		transform: rewriteAppReadmeLinks,
	},
	{
		kind: "copy",
		src: "packages/observability/README.md",
		dst: "architecture/apps/observability.md",
		transform: rewriteAppReadmeLinks,
	},

	// Audience landing pages
	{ kind: "compute", dst: "onboarding/home.md", build: buildOnboardingHome },
	{ kind: "compute", dst: "architecture/home.md", build: buildArchitectureHome },
];

function buildOnboardingHome(): string {
	return [
		"# Onboarding",
		"",
		"Land here on your first day. Get the editor running locally, learn the monorepo layout, and pick up the team workflow.",
		"",
		"- [Getting Started](getting-started) — prerequisites, install, run.",
		"- [Repo Tour](repo-tour) — monorepo layout and per-app entry points.",
		"- [Dev Setup](dev-setup) — local services (MinIO, RabbitMQ), required env, dev URLs.",
		"- [Workflow](workflow) — TDD loop, lint/type-check/test commands, contribution flow.",
		"",
	].join("\n");
}

function buildArchitectureHome(): string {
	return [
		"# Architecture",
		"",
		"How the system is put together. Domain glossary, ADRs, per-app and per-package deep dives.",
		"",
		"- [Overview](overview) — system context, container map, end-to-end flows (export, preview, upload).",
		"- [Glossary](glossary) — domain terms used throughout the codebase.",
		"- [ADRs](adr/index) — accepted architectural decisions and their rationale.",
		"- Apps & Packages",
		"  - [frontend](apps/frontend)",
		"  - [server](apps/server)",
		"  - [iframe-demo](apps/iframe-demo)",
		"  - [core-mock](apps/core-mock)",
		"  - [mock-vod](apps/mock-vod)",
		"  - [contract](apps/contract)",
		"  - [observability](apps/observability)",
		"",
	].join("\n");
}

function buildDevSetup(): string {
	return [
		"# Dev Setup",
		"",
		"Local environment setup for the video-editor monorepo.",
		"",
		"## Prerequisites",
		"",
		"- Node.js **22.18+** (TypeScript is executed directly by Node — no `tsx`/`ts-node`).",
		"- pnpm **10+**.",
		"- Docker (for MinIO + RabbitMQ).",
		"",
		"## Bring up infrastructure",
		"",
		"```bash",
		"docker compose up -d",
		"```",
		"",
		"This starts MinIO (S3-compatible storage, ports `9000`/`9001`) and RabbitMQ (`5672`, management UI on `15672`). Default MinIO credentials: `minioadmin` / `minioadmin123`.",
		"",
		"## Configure the server",
		"",
		"```bash",
		"cp apps/server/.env.example apps/server/.env",
		"```",
		"",
		"Defaults work for local dev; the full env schema is documented under [architecture/apps/server](../architecture/apps/server).",
		"",
		"## Run everything",
		"",
		"```bash",
		"pnpm install",
		"pnpm dev",
		"```",
		"",
		"Turborepo runs all apps in parallel.",
		"",
		"## Default URLs",
		"",
		"| App | URL |",
		"|---|---|",
		"| Frontend | http://localhost:3000 |",
		"| Server API | http://localhost:4001 |",
		"| Iframe demo | http://localhost:8080 |",
		"| Core mock | http://localhost:8002 |",
		"| Mock VOD | http://localhost:5050 |",
		"| MinIO console | http://localhost:9001 |",
		"| RabbitMQ console | http://localhost:15672 |",
		"",
		"## Optional frontend env",
		"",
		"- `VITE_EDITOR_PARENT_ORIGINS` — comma-separated allowed origins for iframe `postMessage` (set when embedding the editor in another origin's page).",
		"",
	].join("\n");
}

function buildWorkflow(): string {
	return [
		"# Workflow",
		"",
		"How the team works on this repo.",
		"",
		"## Development philosophy",
		"",
		"Prefer **TDD**: red → green → refactor. One test at a time, vertical slices only — never write all tests then all code.",
		"",
		"- Write one failing test for one behaviour, implement the minimum to pass, repeat.",
		"- Tests verify behaviour through public interfaces, not implementation details. Tests must survive internal refactors.",
		"- No mocking internal collaborators. Use real code paths.",
		"",
		"## Required checks before pushing",
		"",
		"```bash",
		"pnpm lint",
		"turbo run type-check",
		"pnpm test",
		"pnpm knip",
		"```",
		"",
		"All four must pass.",
		"",
		"## Per-app commands",
		"",
		"```bash",
		"cd apps/frontend    && pnpm dev   # Vite dev server (3000)",
		"cd apps/server      && pnpm dev   # Node --watch on src/index.ts (4001)",
		"cd apps/iframe-demo && pnpm dev   # Angular dev server (8080)",
		"```",
		"",
		"## Closed-network reminders",
		"",
		"- No public CDN links.",
		"- No runtime fetches to public URLs.",
		"- All third-party dependencies must be self-hostable or bundled.",
		"",
	].join("\n");
}

// ── Engine ───────────────────────────────────────────────────────────────────

function readDir(dir: string): string[] {
	return readdirSync(dir);
}

function expandAdrSources(): Source[] {
	const dir = join(REPO_ROOT, "docs/adr");
	const files = readDir(dir)
		.filter((f) => /^\d{4}-.*\.md$/.test(f))
		.sort();
	return files.map<Source>((f) => ({
		kind: "copy",
		src: `docs/adr/${f}`,
		dst: `architecture/adr/${f}`,
	}));
}

function writeFile(absPath: string, body: string): void {
	mkdirSync(dirname(absPath), { recursive: true });
	writeFileSync(absPath, body);
}

function loadManifest(): string[] {
	if (!existsSync(MANIFEST_PATH)) return [];
	try {
		const parsed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
		return Array.isArray(parsed?.generated) ? parsed.generated : [];
	} catch {
		return [];
	}
}

function main(): void {
	const allSources = [...SOURCES, ...expandAdrSources()];

	const oldManifest = new Set(loadManifest());
	const newManifest = new Set<string>();

	let wrote = 0;
	for (const s of allSources) {
		const dstAbs = join(WIKI_ROOT, s.dst);
		const raw =
			s.kind === "copy"
				? applyTransform(readFileSync(join(REPO_ROOT, s.src), "utf8"), s.transform)
				: s.build();
		writeFile(dstAbs, stripWikiMdExtensions(raw));
		newManifest.add(s.dst);
		wrote++;
	}

	// Track the manifest itself so cleanup knows to leave it alone.
	const manifestRelPath = relative(WIKI_ROOT, MANIFEST_PATH);
	newManifest.add(manifestRelPath);

	// Delete orphans: files we generated last time but not this time.
	let deleted = 0;
	for (const oldPath of oldManifest) {
		if (newManifest.has(oldPath)) continue;
		const abs = join(WIKI_ROOT, oldPath);
		if (existsSync(abs)) {
			rmSync(abs);
			deleted++;
		}
	}

	writeFileSync(
		MANIFEST_PATH,
		`${JSON.stringify(
			{
				_comment:
					"Auto-generated by scripts/build-wiki.ts. Do not edit by hand. Lists files owned by the generator; everything else in wiki/ is hand-written and never touched by the script.",
				generated: [...newManifest].sort(),
			},
			null,
			2,
		)}\n`,
	);

	console.log(
		`build-wiki: wrote ${wrote} generated files, deleted ${deleted} orphans, left hand-written pages untouched.`,
	);
}

function applyTransform(body: string, transform: ((s: string) => string) | undefined): string {
	return transform ? transform(body) : body;
}

main();
