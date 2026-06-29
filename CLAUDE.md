# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Closed network deployment:** Production runs in closed, air-gapped network environments with no public internet access. All dependencies must be self-hosted or bundled. Do not introduce external CDN links, public API calls, or any runtime fetches to public URLs.
** Developer Rules for Closed Network Migration:**
 1. **Strict Configuration:** All infrastructure URLs, hostnames, IPs, and ports must be strictly managed via environment variables. Never hardcode these values anywhere in the codebase. Always enforce and register them within the dedicated configuration/validation files of the respective application or service (e.g., Zod schemas, env.ts, or config.ts files within that specific package).
  2. **Migration Tags:** When adding new infrastructure or network-dependent logic, always place a structured comment: 
     `// TODO (Requires-Network-Change): <what needs to change>` 
     This ensures we can easily audit what needs to be changed/configured during deployment from the civilian to the closed network.

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
  observability/    — OpenTelemetry + Pino + Pyroscope toolkit (@ztube/observability)
```

`core-mock` and `mock-vod` coordinate via `POST /__internal/register-token` so cross-service `vod-token` trust mirrors the real Core/VOD relationship. See [docs/adr/0002-mock-vod-as-separate-app.md](docs/adr/0002-mock-vod-as-separate-app.md).

Per-app guidance:
- [apps/frontend/CLAUDE.md](apps/frontend/CLAUDE.md)
- [apps/server/CLAUDE.md](apps/server/CLAUDE.md)
- [apps/iframe-demo/CLAUDE.md](apps/iframe-demo/CLAUDE.md)
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
| GET | `/editor/demo-assets/:filename` | preview |

Worker manifests live in `deploy/worker/`. See [docs/adr/0005-render-worker-deployment.md](docs/adr/0005-render-worker-deployment.md).

→ See [apps/server/CLAUDE.md](apps/server/CLAUDE.md) for full detail.

### Iframe Demo (`apps/iframe-demo`)

Angular 21 standalone app on port 8080. Embeds `/editor/embed` in a floating, draggable/resizable iframe. Provides a control panel to send `EDITOR_ADD_PREVIEW_ITEM` and `EDITOR_CLEAR_PROJECT` messages and displays responses. Primary harness for testing the iframe integration.

→ See [apps/iframe-demo/CLAUDE.md](apps/iframe-demo/CLAUDE.md) for full detail.

### Package: contract (`packages/contract`)

Published as `@video-editor/contract`. Two sub-paths:
- `/iframe` — Zod schemas + types for the editor↔parent postMessage protocol.
- `/events` — versioned `Envelope<T>` + Zod schemas for AMQP events published to the `video-editor` topic exchange (`export.started`, `export.completed`, `export.failed`). External teams bind queues against this exchange and import schemas from `/events` for consumer-side validation.

Root export (`@video-editor/contract`) re-exports `iframe` + shared `SavedMediaItem`/`SavedMediaPayload`.

→ See [packages/contract/CLAUDE.md](packages/contract/CLAUDE.md) for full detail and [packages/contract/src/events/README.md](packages/contract/src/events/README.md) for the consumer onboarding doc.

## Key External Dependencies

- **`@designcombo/*`** — proprietary packages (state, timeline, transitions, animations, frames, events, types). Core to editor behavior.
- **Remotion** — video composition engine. `@remotion/player` renders the canvas preview in the browser.
- **`@ffmpeg-installer/ffmpeg`** — bundled FFmpeg binary (no system install needed). Server uses raw `spawn` for all FFmpeg processing.
- **`@fastify/multipart`** — file upload handling (500 MB limit).
- **`@ztube/observability`** — internal package providing OpenTelemetry tracing/metrics, Pino structured logging, and Pyroscope profiling for server + worker.
- **`mongodb`** — official MongoDB Node.js driver (server only). Used to persist editor draft state (`drafts` collection). Connection configured via `MONGODB_URI` + `MONGODB_DB_NAME` env vars.

## Agent skills

### Issue tracker

GitHub Issues at `danielrispler/react-video-editor` (not yet in active use; configured for future use). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
