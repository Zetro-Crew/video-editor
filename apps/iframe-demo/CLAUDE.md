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
| `src/app/message-types.ts` | Local type mirror of `@video-editor/iframe-contract` |
| `src/environments/environment.ts` | `editorUrl: http://localhost:3000/editor/embed` |

## postMessage Integration

Editor iframe is loaded at `editorUrl` from `environment.ts`. The demo app:

1. Sends `EDITOR_ADD_PREVIEW_ITEM` (`recording-range` kind) to the editor
2. Sends `EDITOR_CLEAR_PROJECT` to reset the editor
3. Displays outgoing payload and last response

`editor-bridge.service.ts` uses Angular signals to queue items across page navigation.

## Dependencies

- `@angular/core` v21, `@angular/router` — framework
- `rxjs` v7 — reactive patterns
