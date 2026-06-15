# iframe Demo App

> **Closed network deployment:** This app runs in air-gapped environments. The editor iframe URL must point to the internal server — never a public host.
>
> **Keep this file updated:** Update whenever features, dependencies, or architecture change.

Angular 21 standalone components harness for testing iframe integration. Port **8080**.

## Commands

```bash
pnpm dev          # ng serve --port 8080
pnpm build        # ng build
pnpm lint         # biome check .
pnpm format       # biome format . --write
pnpm type-check   # tsc -p tsconfig.json --noEmit
```

## Entry & Routing

- Entry: `src/main.ts` — bootstraps Angular app
- Routes: `src/app/app.routes.ts`
  - `/` → `EditorPageComponent`
  - `/media` → `MediaPageComponent`

## Key Files

| File | Purpose |
|------|---------|
| `src/app/pages/editor-page/editor-page.component.ts` | Main page — hosts iframe, drag/resize, postMessage send/receive |
| `src/app/pages/media-page/media-page.component.ts` | Secondary media page |
| `src/app/services/editor-bridge.service.ts` | Angular signal-based queue — injects items cross-page |
| `src/app/message-types.ts` | Local type mirror of `@video-editor/contract/iframe/*` |
| `src/environments/environment.ts` | `editorUrl: http://localhost:3000/editor/embed` |

## postMessage Integration

Editor iframe is loaded at `editorUrl` from `environment.ts`. The demo app:

1. Right panel has two send forms:
   - `recording-range` — channel id + start/end time → sends `EDITOR_ADD_PREVIEW_ITEM`
   - `media` — single text input bound to `mediaId` → sends `EDITOR_ADD_MEDIA { mediaId }`. Preset chips for `img-001`, `img-002`, `img-003`, `demo-clip-001`, `uploaded-001`, `screenshot-001` (all served by `apps/core-mock`).
2. Sends `EDITOR_CLEAR_PROJECT` to reset the editor
3. Displays outgoing payload and last response. Response panel matches `EDITOR_ADD_MEDIA` replies by echoed `mediaId` (not `requestId`).

Auth (`ztube-token`) is **not** forwarded via postMessage. The cookie is HttpOnly and travels server-side: the iframe's fetch to its same-origin server attaches it automatically.

`editor-bridge.service.ts` uses Angular signals to queue items across page navigation.

## Dependencies

- `@angular/core` v21, `@angular/router` — framework
- `rxjs` v7 — reactive patterns
