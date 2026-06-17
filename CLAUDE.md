# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Closed network deployment:** Production runs in closed, air-gapped network environments with no public internet access. All dependencies must be self-hosted or bundled. Do not introduce external CDN links, public API calls, or any runtime fetches to public URLs.

**Keep this file updated:** Whenever you add features, change architecture, add/remove dependencies, or modify config — update this file and the relevant per-app `CLAUDE.md` to reflect the current state. The `README.md` must also be updated to stay accurate.

## Monorepo Structure

pnpm + Turborepo monorepo. Workspace root is `apps/*` and `packages/*`.

```
apps/
  frontend/    — Vite + React 19 + React Router v7 (port 3000)
  server/      — Fastify + Node.js (port 4000)
  iframe-demo/ — Angular 21 demo harness for iframe integration (port 8080)
  core-mock/   — Fastify mock of the Core service (port 8002)
  mock-vod/    — Fastify mock of the VOD service (port 5050)
packages/
  contract/         — shared postMessage + AMQP event contract (@video-editor/contract)
```

`core-mock` and `mock-vod` coordinate via `POST /__internal/register-token` so cross-service `vod-token` trust mirrors the real Core/VOD relationship. See [docs/adr/0002-mock-vod-as-separate-app.md](docs/adr/0002-mock-vod-as-separate-app.md).

Per-app guidance:
- [apps/frontend/CLAUDE.md](apps/frontend/CLAUDE.md)
- [apps/server/CLAUDE.md](apps/server/CLAUDE.md)
- [apps/iframe-demo/CLAUDE.md](apps/iframe-demo/CLAUDE.md)
- [apps/core-mock/CLAUDE.md](apps/core-mock/CLAUDE.md)
- [apps/mock-vod/CLAUDE.md](apps/mock-vod/CLAUDE.md)
- [packages/contract/CLAUDE.md](packages/contract/CLAUDE.md)

## Repo Rules

- Server runtime is Node.js `22.18+`.
- Use `pnpm` for all package management. Add dependencies with `pnpm add` or `pnpm add -D`, and do not use `npm`.
- Use only imports with `.ts` and not `.js`.
- Server TypeScript is executed directly with Node.js. Do not introduce `tsx`/`ts-node` for normal app execution.
- After each completed prompt, run these checks before finishing:
  ```bash
  pnpm lint
  turbo run type-check
  pnpm test
  pnpm knip
  ```

## Development Philosophy

Prefer TDD: red → green → refactor. One test at a time, vertical slices only — never write all tests then all code.

- Write one failing test for one behavior, implement minimal code to pass, repeat.
- Tests verify behavior through public interfaces, not implementation details. Tests must survive internal refactors.
- No mocking internal collaborators. Use real code paths.
- Run `/tdd` skill for guidance when building features or fixing bugs test-first.

## Commands

```bash
# Root — runs both apps in parallel via Turborepo
pnpm dev
pnpm lint
pnpm build

# Per-app
cd apps/frontend    && pnpm dev
cd apps/server      && pnpm dev    # node runs TypeScript directly in watch mode
cd apps/iframe-demo && pnpm dev    # Angular dev server on port 8080

# Type check
cd apps/frontend && pnpm exec tsc --noEmit
cd apps/server   && pnpm exec tsc --noEmit

# Format (biome)
pnpm format

# Tests (Vitest)
cd apps/server && pnpm test   # vitest run
cd packages/contract && pnpm test   # builds then runs dist/**/*.test.js
```

## Local Dev Setup

MinIO (S3-compatible storage) and RabbitMQ must be running before the app works:

```bash
docker compose up -d
```

Configure `apps/server/.env`. Frontend needs no `.env` in dev. The server defaults to `http://localhost:4001`. Vite proxies `/render`, `/editor`, and `/upload` to it during local development. Uploads use the presigned-URL flow: client requests a signed URL from `/upload/signed-url`, then PUTs the file directly to MinIO on `http://localhost:9000` (MinIO CORS in `docker-compose.yml` allows `http://localhost:3000` and `http://localhost:8080`).

**Optional frontend env:**
- `VITE_EDITOR_PARENT_ORIGINS` — comma-separated allowed origins for iframe postMessage (required when embedding the editor in an iframe).

## Architecture

### Frontend (`apps/frontend`)

Vite + React 19 SPA on port 3000. Core feature is `src/features/editor/` — the full video editing UI with scene canvas (Moveable/Selecto), timeline (`@designcombo/timeline`), Remotion `<Player>`, and per-type property panels. State via 8 Zustand stores. Supports iframe embedding via `useEditorPostMessage` hook.

→ See [apps/frontend/CLAUDE.md](apps/frontend/CLAUDE.md) for full detail.

### Server (`apps/server`)

Fastify + Node.js 22.18+. Two entrypoints, one image:

- **API** on port 4001 (`src/index.ts`) — HTTP only. Enqueues render commands on a RabbitMQ queue.
- **Worker** on probe port 8081 (`src/worker.ts`) — consumes the queue, runs FFmpeg, publishes lifecycle events.

Follows **hexagonal architecture** (Ports & Adapters): features live in `src/features/<name>/` with `adapters/inbound/{http,amqp}/`, `adapters/outbound/{ffmpeg,s3,amqp,http}/`, `application/use-cases/`, and `domain/`. Shared domain types and ports in `src/shared/`. Infrastructure adapters in `src/infrastructure/`.

Three features: `upload`, `render`, `preview`.

Routes (API):
| Method | Path | Feature |
|--------|------|---------|
| POST | `/upload/signed-url` | upload |
| POST | `/render` | render — returns 202 `{ id }`; 503 if broker unavailable. No GET endpoint — clients track lifecycle via AMQP `export.*` events |
| POST | `/editor/preview-source` | preview |
| GET | `/editor/segment` | preview |
| GET | `/docs` | Swagger UI for the public REST API |
| GET | `/openapi.json` | OpenAPI 3.0 spec consumed by `/docs`. `servers[0].url` = `${SERVER_BASE_URL}${SERVER_PUBLIC_PATH_PREFIX}`. `/editor/segment` and `/health` are hidden from the spec. |

Worker manifests live in `deploy/worker/`. See [docs/adr/0005-render-worker-deployment.md](docs/adr/0005-render-worker-deployment.md).

→ See [apps/server/CLAUDE.md](apps/server/CLAUDE.md) for full detail.

### Iframe Demo (`apps/iframe-demo`)

Angular 21 standalone app on port 8080. Embeds `/editor/embed` in a floating, draggable/resizable iframe. Provides a control panel to send `EDITOR_ADD_PREVIEW_ITEM` (recording-range form), `EDITOR_ADD_MEDIA { mediaId }` (id text input + preset chips backed by `apps/core-mock`), and `EDITOR_CLEAR_PROJECT`; displays responses. Primary harness for testing the iframe integration.

→ See [apps/iframe-demo/CLAUDE.md](apps/iframe-demo/CLAUDE.md) for full detail.

### Package: contract (`packages/contract`)

Published as `@video-editor/contract`. **No root barrel** — every caller imports a subpath so the bucket they touch is explicit. Four subpath buckets:

| Subpath | Purpose |
|---|---|
| `/iframe/from-parent` | Parent → editor postMessage Zod schemas + types |
| `/iframe/to-parent` | Editor → parent postMessage Zod schemas + types |
| `/events` | Versioned `Envelope<T>` + Zod schemas for AMQP events on the `video-editor` topic exchange (`export.started`, `export.completed`, `export.failed`). External teams bind queues here and import schemas for consumer-side validation |
| `/internal/<feature>` | Server-owner HTTP API schemas (`upload`, `edit-video`, `render`, `shared`). **`apps/server` only** — external consumers must not import. See [docs/adr/0004-server-http-schemas-in-shared-contract-package.md](docs/adr/0004-server-http-schemas-in-shared-contract-package.md) |

Current major **`0.2.0`** (bumped when the from-parent union dropped `imagePayloadSchema` + `mediaPayloadSchema` for the new top-level `EDITOR_ADD_MEDIA` message — see [docs/adr/0007-stored-media-id-only-intake.md](docs/adr/0007-stored-media-id-only-intake.md)). `SavedMediaItem` / `SavedMediaPayload` live in `src/shared/saved-media.ts` and are re-exported from both `/iframe/to-parent` and `/events`.

→ See [packages/contract/CLAUDE.md](packages/contract/CLAUDE.md) for full detail and [packages/contract/src/events/README.md](packages/contract/src/events/README.md) for the consumer onboarding doc.

## Key External Dependencies

- **`@designcombo/*`** — proprietary packages (state, timeline, transitions, animations, frames, events, types). Core to editor behavior.
- **Remotion** — video composition engine. `@remotion/player` renders the canvas preview in the browser.
- **`@ffmpeg-installer/ffmpeg`** — bundled FFmpeg binary (no system install needed). Server uses raw `spawn` for all FFmpeg processing.
- **`@fastify/multipart`** — file upload handling (500 MB limit).
- **`@ztube/observability`** — external package (separate repo, installed from the internal registry) providing OpenTelemetry tracing/metrics, Pino structured logging, and Pyroscope profiling for server + worker. Open-network GitHub CI cannot reach the internal registry (and does not clone the sibling SDK), so `.github/workflows/ci.yml` copies a no-op stub (`tools/observability-stub`) into the `link:` path before install. Closed-network builds use the real package; keep the stub's exported surface in sync with the SDK API this repo consumes.

## Wiki

The `wiki/` folder at the repo root is the GitLab project wiki, shaped for the closed network. The operator copies its contents into the `<project>.wiki.git` repo by hand after each refresh.

The wiki is **hand-maintained in Hebrew**. There is no generator. The pages mirror content from the English source files (`README.md`, `CLAUDE.md`, `CONTEXT.md`, `docs/architecture.md`, `docs/adr/*.md`, `apps/*/README.md`, `packages/*/README.md`) but diverge intentionally — when those sources change, update the relevant Hebrew pages by hand. Filenames, link targets, library names, code blocks, env vars, and CLI commands stay in English; prose is Hebrew.

## Agent skills

### Issue tracker

GitHub Issues at `danielrispler/react-video-editor` (not yet in active use; configured for future use). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
