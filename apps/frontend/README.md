# Frontend — `@video-editor/frontend`

Vite + React 19 SPA. The full browser-based video editing UI. Runs on port **3000**.

## Commands

```bash
pnpm dev          # Vite dev server (port 3000)
pnpm build        # tsc + vite build
pnpm lint         # Biome check + write
pnpm format       # Biome format
pnpm type-check   # tsc --noEmit
pnpm test:e2e     # Playwright E2E tests
pnpm test:e2e:ui  # Playwright interactive UI
```

## Routes

| Path | Component | Description |
|---|---|---|
| `/` | `Home.tsx` | Landing / project list |
| `/edit` | `EditPage.tsx` | New project |
| `/edit/:id` | `EditPage.tsx` | Open existing project |
| `/editor/embed` | `EditPage.tsx` | iframe embedding target |

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
| `hooks/` | Editor-specific hooks |
| `external-preview/` | iframe postMessage handling |
| `crop-modal/` | Crop editing modal |

### State (Zustand Stores)

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

Global scene store: `src/store/use-scene-store.ts`

## iframe Embedding

Mount the editor at `/editor/embed` inside an iframe. The `useEditorPostMessage` hook handles the postMessage bridge.

**Inbound messages:**
- `EDITOR_ADD_PREVIEW_ITEM` — append a video, audio, or recording track
- `EDITOR_CLEAR_PROJECT` — reset all tracks and duration

**Outbound:**
- `EDITOR_READY` — fired once on init

Types are provided by `@video-editor/iframe-contract` (workspace package).

**Configure allowed origins:**

```bash
# apps/frontend/.env (optional)
VITE_EDITOR_PARENT_ORIGINS=https://your-app.example.com
```

Defaults to `window.location.origin` when unset.

## Styling

Tailwind v4 + shadcn/ui (new-york style). CSS variables in `src/globals.css`. Dark mode via `next-themes`.

## Key Dependencies

| Package | Purpose |
|---|---|
| `@remotion/*` v4 | Video composition and player |
| `@designcombo/*` | Timeline, animations, frames, state |
| `zustand` v5 | Client state |
| `@tanstack/react-query` v5 | Server state / data fetching |
| `react-router-dom` v7 | Routing |
| `@radix-ui/*` | Headless UI primitives |
| `@video-editor/iframe-contract` | postMessage protocol types |
