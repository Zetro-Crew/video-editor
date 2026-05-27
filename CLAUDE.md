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
packages/
  editor-contract/  — shared postMessage contract (@video-editor/iframe-contract)
```

Per-app guidance:
- [apps/frontend/CLAUDE.md](apps/frontend/CLAUDE.md)
- [apps/server/CLAUDE.md](apps/server/CLAUDE.md)
- [apps/iframe-demo/CLAUDE.md](apps/iframe-demo/CLAUDE.md)
- [packages/editor-contract/CLAUDE.md](packages/editor-contract/CLAUDE.md)

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
cd packages/editor-contract && pnpm test   # builds then runs dist/**/*.test.js
```

## Local Dev Setup

MinIO (S3-compatible storage) and Redis must be running before the app works:

```bash
docker compose up -d
```

Configure `apps/server/.env`. Frontend needs no `.env` in dev. The server defaults to `http://localhost:4001`. Vite proxies `/render`, `/editor`, and `/uploads` to it during local development; `/api/media` proxies to the media API.

**Optional frontend env:**
- `VITE_EDITOR_PARENT_ORIGINS` — comma-separated allowed origins for iframe postMessage (required when embedding the editor in an iframe).

## Architecture

### Frontend (`apps/frontend`)

Vite + React 19 SPA on port 3000. Core feature is `src/features/editor/` — the full video editing UI with scene canvas (Moveable/Selecto), timeline (`@designcombo/timeline`), Remotion `<Player>`, and per-type property panels. State via 6 Zustand stores. Supports iframe embedding via `useEditorPostMessage` hook.

→ See [apps/frontend/CLAUDE.md](apps/frontend/CLAUDE.md) for full detail.

### Server (`apps/server`)

Fastify + Node.js 22.18+ API on port 4000. Follows **hexagonal architecture** (Ports & Adapters): features live in `src/features/<name>/` with `adapters/inbound/http/` (controllers), `adapters/outbound/` (Redis, FFmpeg, S3), `application/use-cases/`, and `domain/`. Shared domain types and ports in `src/shared/`. Infrastructure adapters in `src/infrastructure/`.

Five features: `upload`, `edit-video`, `render`, `preview`, `editor-export`.

Routes:
| Method | Path | Feature |
|--------|------|---------|
| POST | `/upload/signed-url` | upload |
| POST | `/uploads/file` | upload |
| POST | `/cleanup` | upload |
| POST | `/edit-video` | edit-video |
| GET | `/edit-video/progress/:jobId` | edit-video |
| POST | `/render` | render |
| GET | `/render` | render |
| DELETE | `/render` | render |
| POST | `/editor/preview-source` | preview |
| GET | `/editor/segment` | preview |
| GET | `/editor/demo-assets/:filename` | preview |
| POST | `/editor/export` | editor-export |

→ See [apps/server/CLAUDE.md](apps/server/CLAUDE.md) for full detail.

### Iframe Demo (`apps/iframe-demo`)

Angular 21 standalone app on port 8080. Embeds `/editor/embed` in a floating, draggable/resizable iframe. Provides a control panel to send `EDITOR_ADD_PREVIEW_ITEM` and `EDITOR_CLEAR_PROJECT` messages and displays responses. Primary harness for testing the iframe integration.

→ See [apps/iframe-demo/CLAUDE.md](apps/iframe-demo/CLAUDE.md) for full detail.

### Package: editor-contract (`packages/editor-contract`)

Published as `@video-editor/iframe-contract`. Defines Zod schemas and TypeScript types for the postMessage protocol. Key exports: `parentToEditorMessageSchema`, `ParentToEditorMessage`, `EditorToParentMessage`, `PreviewItemPayload`, `EditorReadyMessage`, and response factories.

→ See [packages/editor-contract/CLAUDE.md](packages/editor-contract/CLAUDE.md) for full detail.

## Key External Dependencies

- **`@designcombo/*`** — proprietary packages (state, timeline, transitions, animations, frames, events, types). Core to editor behavior.
- **Remotion** — video composition and rendering engine. Player renders the canvas; `@remotion/renderer` for export.
- **`@fastify/multipart`** — file upload handling (500 MB limit).
- **`fluent-ffmpeg`** — FFmpeg wrapper used throughout server source processing and overlay pipelines.

## Agent skills

### Issue tracker

GitHub Issues at `danielrispler/react-video-editor` (not yet in active use; configured for future use). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
