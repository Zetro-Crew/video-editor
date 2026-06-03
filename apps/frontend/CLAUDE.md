# Frontend App

> **Closed network deployment:** This app runs in air-gapped environments. No public CDN links, no runtime fetches to external URLs. All assets must be served from the internal server or bundled.
>
> **Keep this file updated:** Update whenever features, dependencies, or architecture change.

Vite + React 19 + React Router v7 SPA. Port **3000**.

## Commands

```bash
pnpm dev          # Vite dev server
pnpm build        # tsc + vite build
pnpm preview      # vite preview
pnpm lint         # biome check --write
pnpm type-check   # tsc --noEmit
pnpm test         # vitest run (unit)
pnpm test:e2e     # playwright test
pnpm test:e2e:ui  # playwright test --ui
```

## Entry & Routing

- Entry: `src/main.tsx` — mounts React, wraps with `BrowserRouter`, `ThemeProvider`, `QueryProvider`
- Routes (`src/App.tsx`):
  - `/` → `src/pages/Home.tsx`
  - `/edit` / `/edit/:id` → `src/pages/EditPage.tsx`
  - `/editor/embed` → `src/pages/EditPage.tsx` (iframe target)
- Path alias: `@/` → `src/`

## Editor Feature (`src/features/editor/`)

Root component: `editor.tsx` (accepts optional `id` prop — scene ID).

| Directory | Purpose |
|-----------|---------|
| `scene/` | Canvas rendering area — Moveable + Selecto drag-select |
| `timeline/` | Timeline scrubber built on `@designcombo/timeline` |
| `player/` | Remotion `<Player>` + `<Composition>` with all track renderers |
| `menu-item/` | Left panel — videos, images, audio, text, uploads, shapes |
| `control-item/` | Right panel — per-type property controls |
| `store/` | Zustand stores (see below) |
| `hooks/` | Editor-specific hooks |
| `utils/` | Editor utilities |
| `constants/` | Scale, fonts, etc. |
| `external-preview/` | iframe postMessage handling |
| `crop-modal/` | Crop editing modal |
| `interfaces/` | Shared TS interfaces (editor, layout) |

### Zustand Stores (`src/features/editor/store/`)

| File | Purpose |
|------|---------|
| `use-composition-store.ts` | Canvas size + FPS state |
| `use-upload-store.ts` | Upload state |
| `use-layout-store.ts` | Panel layout |
| `use-crop-store.ts` | Crop modal state |
| `use-download-state.ts` | Export state (fire-and-forget POST to /render, no polling) |
| `use-editor-refs.ts` | DOM/player refs (playerRef, etc.) |
| `use-selection-store.ts` | Selected item state |
| `use-timeline-view-store.ts` | Timeline view/scroll state |

## Other `src/` Directories

| Directory | Purpose |
|-----------|---------|
| `components/` | Shared UI primitives (shadcn/ui) + `query-provider.tsx` |
| `hooks/` | App-level hooks (outside editor feature) |
| `lib/` | Utility libs (e.g., `utils.ts` for `cn`) |
| `pages/` | Route components (`Home.tsx`, `EditPage.tsx`) |
| `utils/` | App utilities incl. `upload-service.ts` |

## iframe Embedding

`useEditorPostMessage` hook (in `editor.tsx`) listens for `window.postMessage` from parent. Uses `@video-editor/contract/iframe/from-parent` (parse incoming) and `@video-editor/contract/iframe/to-parent` (build responses) for typed schemas.

Supported inbound messages:
- `EDITOR_ADD_PREVIEW_ITEM` — adds video/audio track at end of timeline (`recording-range`, `media`, `audio-range` payloads)
- `EDITOR_CLEAR_PROJECT` — wipes all tracks, resets duration

Outbound: `EDITOR_READY` on init, responses to each message.

Allowed origins: `VITE_EDITOR_PARENT_ORIGINS` env var (comma-separated; defaults to `window.location.origin`).

Auth: no token is passed via postMessage. The editor and its server share an origin (prod gateway; dev vite proxy), so the browser auto-attaches the HttpOnly `ztube-token` cookie on `fetch('/editor/preview-source', …)`. The server reads it from the `Cookie` header and forwards it upstream to Core.

## Styling

- Tailwind v4 + shadcn/ui (new-york style)
- CSS variables for theming in `src/globals.css`
- Dark mode via `next-themes`

## Data Fetching

React Query via `src/components/query-provider.tsx`. Server state for API calls.

## Uploads

`src/utils/upload-service.ts` — two-phase presigned-URL flow: `POST /upload/signed-url` (gets MinIO PUT URL) → axios PUT direct to MinIO. Browser uploads never traverse the server. Requires MinIO CORS allowing the frontend origin (configured in root `docker-compose.yml`).

## Key Dependencies

- `@remotion/*` v4 — video rendering (Player, Renderer, Media, Shapes)
- `@designcombo/*` — timeline, animations, frames, state
- `zustand` v5 — state management
- `@tanstack/react-query` v5 — server state
- `react-router-dom` v7 — routing
- `@radix-ui/*` — headless UI primitives
- `@video-editor/contract` — postMessage + event schemas (workspace; use `/iframe/from-parent`, `/iframe/to-parent`, `/shared` subpaths)

## Environment

Optional only — no required env in dev:
- `VITE_EDITOR_PARENT_ORIGINS` — comma-separated allowed origins for iframe postMessage
