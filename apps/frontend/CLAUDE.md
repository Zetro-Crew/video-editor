# Frontend App

> **Closed network deployment:** This app runs in air-gapped environments. No public CDN links, no runtime fetches to external URLs. All assets must be served from the internal server or bundled.
>
> **Keep this file updated:** Update whenever features, dependencies, or architecture change.

Vite + React 19 + React Router v7 SPA. Port **3000**.

## Commands

```bash
pnpm dev          # Vite dev server
pnpm build        # tsc + vite build
pnpm lint         # biome check --write
pnpm format       # biome format --write
pnpm type-check   # tsc --noEmit
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

Global scene store: `src/store/use-scene-store.ts`

## iframe Embedding

`useEditorPostMessage` hook (in `editor.tsx`) listens for `window.postMessage` from parent. Uses `@video-editor/iframe-contract` for typed schemas.

Supported inbound messages:
- `EDITOR_ADD_PREVIEW_ITEM` — adds video/audio track at end of timeline (`recording-range`, `media`, `audio-range` payloads)
- `EDITOR_CLEAR_PROJECT` — wipes all tracks, resets duration

Outbound: `EDITOR_READY` on init, responses to each message.

Allowed origins: `VITE_EDITOR_PARENT_ORIGINS` env var (comma-separated; defaults to `window.location.origin`).

## Styling

- Tailwind v4 + shadcn/ui (new-york style)
- CSS variables for theming in `src/globals.css`
- Dark mode via `next-themes`

## Data Fetching

React Query via `src/components/query-provider.tsx`. Server state for API calls.

## Uploads

`src/utils/upload-service.ts` — routes to `POST /api/uploads/file` (file) or `POST /api/uploads/url` (URL). UserId currently hardcoded.

## Key Dependencies

- `@remotion/*` v4 — video rendering (Player, Renderer, Media, Shapes)
- `@designcombo/*` — timeline, animations, frames, state
- `zustand` v5 — state management
- `@tanstack/react-query` v5 — server state
- `react-router-dom` v7 — routing
- `@radix-ui/*` — headless UI primitives
- `@video-editor/iframe-contract` — postMessage types (workspace)

## Environment

Optional only — no required env in dev:
- `VITE_EDITOR_PARENT_ORIGINS` — comma-separated allowed origins for iframe postMessage
