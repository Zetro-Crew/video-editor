# Frontend App

> **Closed network deployment:** This app runs in air-gapped environments. No public CDN links, no runtime fetches to external URLs. All assets must be served from the internal server or bundled.
>
> **Keep this file updated:** Update whenever features, dependencies, or architecture change.

Vite + React 19 + React Router v7 SPA. Port **3000** in dev, **8080** in prod (nginx).

## Commands

```bash
pnpm dev                 # Vite dev server
pnpm build               # tsc + vite build (default mode)
pnpm build:preprod       # vite build --mode preprod
pnpm build:production    # vite build --mode production
pnpm preview             # vite preview
pnpm lint                # biome check --write
pnpm type-check          # tsc --noEmit
pnpm test                # vitest run (unit)
pnpm test:e2e            # playwright test
pnpm test:e2e:ui         # playwright test --ui
pnpm download-assets     # fetch fonts into public/fonts/ (closed-network prep)
```

## Entry & Routing

- Entry: `src/main.tsx` — mounts React, wraps with `BrowserRouter` (basename derived from `import.meta.env.BASE_URL`), `ThemeProvider` (next-themes, dark default), `QueryProvider` (React Query v5), `StoreInitializer`, `BackgroundUploadRunner`, `Toaster` (sonner).
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
| `state/` | Scene mutation helpers (e.g. `reset-editor.ts`) |
| `hooks/` | Editor-specific hooks |
| `utils/` | Editor utilities (fonts, filmstrip, file, saved-item extraction) |
| `constants/` | Scale, fonts, events, payloads |
| `external-preview/` | iframe postMessage handling |
| `crop-modal/` | Crop editing modal |
| `interfaces/` | Shared TS interfaces (`editor.ts`, `layout.ts`) |

Top-level sibling files in `src/features/editor/`: `download-progress-modal.tsx`, `navbar.tsx`, `shortcuts-modal.tsx`.

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
| `selectors.ts` | Reusable selectors across stores |

There is no global scene store outside this folder.

## Other `src/` Directories

| Directory | Purpose |
|-----------|---------|
| `components/` | `ui/` (shadcn primitives), `color-picker/`, `shared/`, `query-provider.tsx`, `store-initializer.tsx`, `theme-provider.tsx`, `modal-upload.tsx` |
| `hooks/` | App-level hooks (`use-media-query.ts`, `use-object-url.ts`) |
| `lib/` | `utils.ts` (`cn` helper) |
| `pages/` | Route components (`Home.tsx`, `EditPage.tsx`) |
| `utils/` | `upload-service.ts`, `fetch-server.ts`, `fetch-core.ts`, `platform.ts` |

`fetch-server.ts` prefixes all server API calls with `VITE_SERVER_EXTENSION`; `fetch-core.ts` prefixes core-service calls with `VITE_CORE_EXTENSION`. Both default to empty string.

## iframe Embedding

`useEditorPostMessage` hook (in `src/features/editor/external-preview/use-editor-post-message.ts`) listens for `window.postMessage` from parent. Uses `@video-editor/contract/iframe/from-parent` (parse incoming) and `@video-editor/contract/iframe/to-parent` (build responses) for typed schemas.

Supported inbound messages:
- `EDITOR_ADD_PREVIEW_ITEM` — adds video/audio track at end of timeline (`recording-range`, `media`, `audio-range` payloads)
- `EDITOR_CLEAR_PROJECT` — wipes all tracks, resets duration

Outbound:
- `EDITOR_READY` — on init
- `EDITOR_PREVIEW_ITEM_ADDED` — ack
- `EDITOR_PREVIEW_ITEM_REJECTED` — nack with reason
- `EDITOR_PROJECT_CLEARED` — ack
- `EDITOR_MEDIA_SAVED` — emitted when an exported render is saved

Allowed origins: `VITE_EDITOR_PARENT_ORIGINS` env var (comma-separated; `window.location.origin` is always allowed in addition).

Auth: no token is passed via postMessage. The editor and its server share an origin (prod gateway; dev vite proxy), so the browser auto-attaches the HttpOnly `ztube-token` cookie on `fetch('/editor/preview-source', …)`. The server reads it from the `Cookie` header and forwards it upstream to Core.

## Dev Server Proxy

Configured in `vite.config.ts`. Three proxy groups:

| Path pattern | Target | Env override |
|---|---|---|
| `^/(render\|uploads\|upload\|cleanup\|edit-video)` | `http://localhost:4001` (server) | `VITE_API_URL` |
| `^/editor/(preview-source\|segment\|demo-assets\|export)` | `http://localhost:4001` (server) | `VITE_API_URL` |
| `^/private/(media\|users\|channels)` | `http://localhost:8002` (core-mock) | `VITE_CORE_URL` |

Build `base` is `VITE_PUBLIC_PATH` (defaults to `/`). Build target is `chrome113`. Manual chunks split vendor bundles (framer, radix, designcombo, remotion, react).

## Styling

- Tailwind v4 + shadcn/ui (new-york style)
- CSS variables for theming in `src/globals.css`
- Dark mode via `next-themes`

## Data Fetching

React Query via `src/components/query-provider.tsx`. Server state for API calls.

## Uploads

`src/utils/upload-service.ts` — two-phase presigned-URL flow: `POST /upload/signed-url` (gets MinIO PUT URL) → axios PUT direct to MinIO. Browser uploads never traverse the server. Requires MinIO CORS allowing the frontend origin (configured in root `docker-compose.yml`).

## Closed-Network Assets

`scripts/download-assets.ts` (run via `pnpm download-assets`) pulls IBM Plex Sans Hebrew, Roboto, Geist-SemiBold, and `the-bold-font` into `public/fonts/` at build prep time. Nothing is fetched at runtime. Easter-egg media (audio/images/extra fonts) lives in `public/easter-eggs/`.

## Production Serving

Built artifacts in `dist/` are served by nginx (`nginx.conf`) listening on **port 8080**. Nginx reverse-proxies these paths to `http://video-editor-server:8080`:
- `^/(render|upload)` — 500 MB body cap, 7200s read/send timeouts, `proxy_request_buffering off`
- `^/editor/(preview-source|segment|demo-assets)` — 7200s read/send timeouts

All other paths fall through to `/index.html` (SPA routing). `Dockerfile` packages the build for OCP deployment.

## Testing

- Vitest unit tests: `vite.config.ts` includes `src/**/*.test.ts` and `src/**/*.test.tsx`. Key suites live under `src/features/editor/store/__tests__/` and `src/features/editor/external-preview/__tests__/`.
- Playwright E2E: `e2e/__tests__/preview-item.spec.ts`. `playwright.config.ts` runs `pnpm dev --host 127.0.0.1` as its `webServer` against `http://127.0.0.1:3000`.

## Key Dependencies

- `@remotion/*` v4 — video rendering (Player, Renderer, Media, Shapes)
- `@designcombo/*` — timeline, animations, frames, state
- `zustand` v5 — state management
- `@tanstack/react-query` v5 — server state
- `react-router-dom` v7 — routing
- `@radix-ui/*` — headless UI primitives
- `@video-editor/contract` — postMessage + event schemas (workspace; use `/iframe/from-parent`, `/iframe/to-parent`, `/shared` subpaths)

## Environment

All optional. None required in dev.

| Var | Used by | Purpose |
|---|---|---|
| `VITE_EDITOR_PARENT_ORIGINS` | `useEditorPostMessage` | Comma-separated allowed origins for iframe postMessage |
| `VITE_SERVER_EXTENSION` | `src/utils/fetch-server.ts` | Path prefix for server API calls |
| `VITE_CORE_EXTENSION` | `src/utils/fetch-core.ts` | Path prefix for core-service API calls |
| `VITE_API_URL` | `vite.config.ts` (dev proxy) | Override for server proxy target |
| `VITE_CORE_URL` | `vite.config.ts` (dev proxy) | Override for core-service proxy target |
| `VITE_PUBLIC_PATH` | `vite.config.ts` (build) | Sets Vite `base` for non-root deploys |
