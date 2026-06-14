# Frontend — `@video-editor/frontend`

The browser-based UI for the video editor. A Vite + React 19 SPA that renders the editing surface — scene canvas, timeline, Remotion player, media library, and per-type property panels — and can also be embedded inside a host application via the `/editor/embed` iframe target. Runs on **port 3000** in dev and **port 8080** behind nginx in production.

> [!NOTE]
> **Closed network deployment.** This app ships into air-gapped environments. No public CDN links, no runtime fetches to external URLs. Fonts and other assets are bundled at build time via `pnpm download-assets` and served from `public/`.

## Commands

```bash
pnpm dev                 # Vite dev server (port 3000)
pnpm build               # tsc + vite build (default mode)
pnpm build:preprod       # build for preprod
pnpm build:production    # build for production
pnpm preview             # serve dist/ locally
pnpm lint                # Biome check + write
pnpm type-check          # tsc --noEmit
pnpm test                # Vitest unit run
pnpm test:e2e            # Playwright E2E
pnpm test:e2e:ui         # Playwright interactive UI
pnpm download-assets     # fetch fonts into public/fonts/ (run before first build)
```

## Routes

| Path | Component | Description |
|---|---|---|
| `/` | `src/pages/Home.tsx` | Landing / project list |
| `/edit` | `src/pages/EditPage.tsx` | New project |
| `/edit/:id` | `src/pages/EditPage.tsx` | Open existing project |
| `/editor/embed` | `src/pages/EditPage.tsx` | iframe embedding target |

`src/main.tsx` wraps the app in `BrowserRouter` (basename from `import.meta.env.BASE_URL`), `ThemeProvider` (dark mode default, `next-themes`), `QueryProvider` (React Query v5), `StoreInitializer`, `BackgroundUploadRunner`, and a sonner `Toaster`.

## Editor Feature (`src/features/editor/`)

The core editing surface. Root component is `editor.tsx`.

| Directory | Purpose |
|---|---|
| `scene/` | Canvas — Moveable + Selecto drag-select |
| `timeline/` | Timeline scrubber (`@designcombo/timeline`) |
| `player/` | Remotion `<Player>` + `<Composition>` |
| `menu-item/` | Left panel — media library, uploads, shapes, text |
| `control-item/` | Right panel — per-type property controls |
| `store/` | Zustand stores |
| `state/` | Scene mutation helpers (e.g. `reset-editor.ts`) |
| `hooks/` | Editor-specific hooks |
| `utils/` | Editor utilities (fonts, filmstrip, saved-item extraction) |
| `constants/` | Scale, fonts, events, payloads |
| `external-preview/` | iframe postMessage handling |
| `crop-modal/` | Crop editing modal |
| `interfaces/` | Shared TS interfaces |

Top-level sibling components in the feature: `download-progress-modal.tsx`, `navbar.tsx`, `shortcuts-modal.tsx`.

### State (Zustand stores)

| Store | Purpose |
|---|---|
| `use-composition-store.ts` | Canvas size + FPS state |
| `use-upload-store.ts` | Upload state |
| `use-layout-store.ts` | Panel layout |
| `use-crop-store.ts` | Crop modal |
| `use-download-state.ts` | Export state (fire-and-forget POST to /render, no polling) |
| `use-editor-refs.ts` | DOM/player refs (playerRef, etc.) |
| `use-selection-store.ts` | Selected item state |
| `use-timeline-view-store.ts` | Timeline view/scroll state |
| `selectors.ts` | Reusable selectors across stores |

All editor state lives in this folder — there is no separate global scene store elsewhere in the app.

## Other `src/` Directories

| Directory | Purpose |
|---|---|
| `components/` | shadcn primitives (`ui/`), `color-picker/`, `shared/`, `query-provider.tsx`, `store-initializer.tsx`, `theme-provider.tsx`, `modal-upload.tsx` |
| `hooks/` | App-level hooks (`use-media-query`, `use-object-url`) |
| `lib/` | `utils.ts` (`cn` helper) |
| `pages/` | Route components |
| `utils/` | `upload-service.ts`, `fetch-server.ts`, `fetch-core.ts`, `platform.ts` |

`fetch-server.ts` prefixes server API calls with `VITE_SERVER_EXTENSION`; `fetch-core.ts` prefixes core-service calls with `VITE_CORE_EXTENSION`. Both default to empty.

## iframe Embedding

Mount the editor at `/editor/embed` inside an iframe. The `useEditorPostMessage` hook (`src/features/editor/external-preview/use-editor-post-message.ts`) handles the postMessage bridge.

**Inbound messages** (parsed via `@video-editor/contract/iframe/from-parent`):
- `EDITOR_ADD_PREVIEW_ITEM` — append a track. Payload `kind` is one of `recording-range`, `media`, `audio-range`.
- `EDITOR_CLEAR_PROJECT` — reset all tracks and duration.

**Outbound messages** (built via `@video-editor/contract/iframe/to-parent`):
- `EDITOR_READY` — fired once on init
- `EDITOR_PREVIEW_ITEM_ADDED` — ack for `EDITOR_ADD_PREVIEW_ITEM`
- `EDITOR_PREVIEW_ITEM_REJECTED` — nack with reason
- `EDITOR_PROJECT_CLEARED` — ack for `EDITOR_CLEAR_PROJECT`
- `EDITOR_MEDIA_SAVED` — emitted when an exported render is saved

**Auth.** No token is sent via postMessage. The editor and its server share an origin (prod gateway; dev Vite proxy), so the browser auto-attaches the HttpOnly `ztube-token` cookie on `fetch('/editor/preview-source', …)`. The server reads it from the `Cookie` header and forwards it upstream to Core.

**Allowed origins:**

```bash
# apps/frontend/.env (optional)
VITE_EDITOR_PARENT_ORIGINS=https://your-app.example.com
```

`window.location.origin` is always allowed in addition to anything listed here.

## Uploads

`src/utils/upload-service.ts` implements a two-phase presigned-URL flow: `POST /upload/signed-url` returns a MinIO PUT URL, then the browser PUTs the file directly to MinIO. Upload bytes never traverse the Node server. MinIO CORS must allow the frontend origin (set in the repo-root `docker-compose.yml`).

## Dev Server Proxy

`vite.config.ts` exposes three proxy groups, each with an env override:

| Path pattern | Target | Override |
|---|---|---|
| `^/(render\|uploads\|upload\|cleanup\|edit-video)` | `http://localhost:4001` (server) | `VITE_API_URL` |
| `^/editor/(preview-source\|segment\|demo-assets\|export)` | `http://localhost:4001` (server) | `VITE_API_URL` |
| `^/private/(media\|users\|channels)` | `http://localhost:8002` (core-mock) | `VITE_CORE_URL` |

Build base is `VITE_PUBLIC_PATH` (defaults to `/`); build target is `chrome113`. Manual chunks split vendor bundles for framer-motion, Radix, designcombo, Remotion, and React.

## Environment

All variables are optional. Nothing is required for `pnpm dev`.

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_EDITOR_PARENT_ORIGINS` | iframe postMessage hook | Comma-separated allowed parent origins |
| `VITE_SERVER_EXTENSION` | `utils/fetch-server.ts` | Path prefix for server API calls |
| `VITE_CORE_EXTENSION` | `utils/fetch-core.ts` | Path prefix for core API calls |
| `VITE_API_URL` | Vite dev proxy | Override server proxy target |
| `VITE_CORE_URL` | Vite dev proxy | Override core-service proxy target |
| `VITE_PUBLIC_PATH` | Vite build | Sets `base` for non-root deploys |

## Production Deployment

Built with `pnpm build:production` (output in `dist/`) and packaged by `Dockerfile` for OCP. At runtime nginx (`nginx.conf`) listens on **port 8080**, serves the SPA from `/usr/share/nginx/html`, and reverse-proxies API traffic to the server service:

| Pattern | Upstream | Notes |
|---|---|---|
| `^/(render\|upload)` | `http://video-editor-server:8080` | 500 MB body cap; 7200s read/send timeouts; `proxy_request_buffering off` |
| `^/editor/(preview-source\|segment\|demo-assets)` | `http://video-editor-server:8080` | 7200s read/send timeouts |
| everything else | — | SPA fallback to `index.html` |

## Styling

Tailwind v4 + shadcn/ui (new-york style). CSS variables in `src/globals.css`. Dark mode via `next-themes`.

## Testing

- **Unit (Vitest)** — `vite.config.ts` picks up `src/**/*.test.ts` and `src/**/*.test.tsx`. Notable suites:
  - `src/features/editor/store/__tests__/use-download-state.test.ts`
  - `src/features/editor/external-preview/__tests__/handle-parent-message.test.ts`
  - `src/features/editor/external-preview/__tests__/payload-intake.test.ts`
- **E2E (Playwright)** — `e2e/__tests__/preview-item.spec.ts`. `playwright.config.ts` boots `pnpm dev --host 127.0.0.1` and targets `http://127.0.0.1:3000`.

## Closed-Network Assets

`scripts/download-assets.ts` fetches IBM Plex Sans Hebrew, Roboto, Geist-SemiBold, and `the-bold-font` into `public/fonts/` ahead of the build. Run it once after a fresh clone — nothing is fetched at runtime. Easter-egg media (audio/images/extra fonts) lives in `public/easter-eggs/`.

## Key Dependencies

| Package | Purpose |
|---|---|
| `@remotion/*` v4 | Video composition and player |
| `@designcombo/*` | Timeline, animations, frames, state |
| `zustand` v5 | Client state |
| `@tanstack/react-query` v5 | Server state / data fetching |
| `react-router-dom` v7 | Routing |
| `@radix-ui/*` | Headless UI primitives |
| `@video-editor/contract` | postMessage + event Zod schemas (workspace; use `/iframe/*` subpaths) |
