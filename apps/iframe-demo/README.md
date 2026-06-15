# iframe Demo — Angular Integration Harness

Angular 21 standalone app for testing the video editor's iframe embedding integration. Runs on port **8080**.

> [!NOTE]
> This is a development harness, not a production application. Use it to test postMessage communication between a host page and the embedded editor.

## Commands

```bash
pnpm dev          # Angular dev server (port 8080)
pnpm build        # ng build
pnpm lint         # Biome check
pnpm format       # Biome format
pnpm type-check   # tsc --noEmit
```

## Setup

The editor must be running at `http://localhost:3000` before starting this app:

```bash
# From repo root
pnpm dev
```

Or run just the required apps:

```bash
cd apps/frontend && pnpm dev   # port 3000
cd apps/iframe-demo && pnpm dev  # port 8080
```

## What It Does

The demo page (`/`) loads the editor in a floating, draggable and resizable iframe pointed at `http://localhost:3000/editor/embed`. A control panel lets you:

- **Send recording-range** — channel id + start/end time → sends `EDITOR_ADD_PREVIEW_ITEM`
- **Send media** — id text input with preset chips (`img-001`, `img-002`, `img-003`, `demo-clip-001`, `uploaded-001`, `screenshot-001` — all backed by `apps/core-mock`) → sends `EDITOR_ADD_MEDIA { mediaId }`
- **Clear the project** — sends `EDITOR_CLEAR_PROJECT` to reset all tracks
- **Inspect messages** — displays the outgoing payload and last response from the editor

Note: `EDITOR_ADD_MEDIA` responses correlate by echoed `mediaId`, not `requestId`.

## Key Files

| File | Purpose |
|---|---|
| `src/app/pages/editor-page/editor-page.component.ts` | Main page — iframe host, drag/resize, postMessage |
| `src/app/pages/media-page/media-page.component.ts` | Secondary media page |
| `src/app/services/editor-bridge.service.ts` | Signal-based queue for cross-page item injection |
| `src/app/message-types.ts` | Local type mirror of `@video-editor/contract/iframe/from-parent` + `/iframe/to-parent` |
| `src/environments/environment.ts` | `editorUrl` configuration |

## Configuration

To point the iframe at a different editor URL, edit `src/environments/environment.ts`:

```ts
export const environment = {
  editorUrl: 'http://localhost:3000/editor/embed',
};
```

## postMessage Protocol

See [packages/contract/README.md](../../packages/contract/README.md) for the full message schema. The demo app uses a local type mirror (`message-types.ts`) rather than importing the workspace package directly.

**Auth:** the `ztube-token` cookie is HttpOnly and never travels via postMessage. The editor iframe's same-origin fetches to its own server attach it automatically.

## Dependencies

| Package | Purpose |
|---|---|
| `@angular/core` v21 | Framework |
| `@angular/router` | Routing |
| `rxjs` v7 | Reactive patterns |
