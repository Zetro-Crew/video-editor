# Iframe Integration

Embed the editor inside your parent application and drive it via `postMessage`. All message shapes are validated by the Zod schemas in `@video-editor/contract`.

## Install

```bash
pnpm add @video-editor/contract@<version>
```

Pin the version. The package is published to your internal package registry — same as any other internal library. **Do not clone this repo to consume it.**

Public subpaths:

| Subpath | Direction |
|---|---|
| `@video-editor/contract/iframe/from-parent` | Parent → editor (you send) |
| `@video-editor/contract/iframe/to-parent` | Editor → parent (you receive) |

> `@video-editor/contract/internal/*` is editor-server-private. Importing it from integrator code will break without notice.

## Embed

Mount an iframe pointing at the editor's embed route:

```html
<iframe
  src="https://<editor-host>/editor/embed"
  allow="clipboard-read; clipboard-write; fullscreen"
  style="width: 100%; height: 100%; border: 0"
></iframe>
```

The editor **must** be served from the same registrable domain as the parent app. Auth uses an `HttpOnly` cookie (`ztube-token`) that the browser attaches automatically on same-origin server fetches. Cross-domain embedding is not supported under this design — see [ADR 0003](../architecture/adr/0003-iframe-auth-via-httponly-cookie.md).

## Configure allowed parent origins (editor side)

Set `VITE_EDITOR_PARENT_ORIGINS` on the editor frontend deployment to the comma-separated list of parent origins permitted to send messages:

```bash
VITE_EDITOR_PARENT_ORIGINS=https://app.example.com,https://staging.example.com
```

Unset → defaults to `window.location.origin`.

## Message flow

```
Parent app                                Editor iframe (/editor/embed)
────────────────────────────────────────────────────────────────────────
                                          ←── EDITOR_READY ────────────
─── EDITOR_ADD_PREVIEW_ITEM ──→
                              EDITOR_PREVIEW_ITEM_ADDED / REJECTED ──→
─── EDITOR_CLEAR_PROJECT ────→
                              ←── EDITOR_PROJECT_CLEARED ─────────────
                              ←── EDITOR_MEDIA_SAVED (after export) ──
```

`EDITOR_READY` fires once on iframe init. Treat it as your "the editor is ready to receive messages" signal.

## Inbound messages — what you send

Schemas live in `@video-editor/contract/iframe/from-parent`.

### `EDITOR_ADD_PREVIEW_ITEM`

Append a track to the editor timeline. Payload is a discriminated union on `kind`.

| `kind` | Use case |
|---|---|
| `recording-range` | A time window of a managed channel recording. The editor resolves it into an HLS playlist via the server. |
| `media` | An arbitrary media URL (mp4 or HLS). You provide a playback URL directly. |
| `audio-range` | An audio segment with a time range. |

Shared envelope:

```ts
import type { EditorAddPreviewItemMessage } from "@video-editor/contract/iframe/from-parent";

const message: EditorAddPreviewItemMessage = {
  type: "EDITOR_ADD_PREVIEW_ITEM",
  requestId: crypto.randomUUID(), // optional — echoed back on the response
  payload: { /* see kind below */ },
};

iframe.contentWindow!.postMessage(message, editorOrigin);
```

#### `kind: "recording-range"`

```ts
{
  kind: "recording-range",
  channelId: "channel-42",
  startTimeMs: 1717000000000,
  endTimeMs:   1717000300000,
  durationMs: 300000,             // max 1h
  // Optional. Omit to let the editor resolve via POST /editor/preview-source.
  playback: { kind: "hls", src: "https://…/playlist.m3u8" },
  sourceOffsetMs: 0,
  posterSrc: "https://…/poster.jpg",
  name: "Morning broadcast",
}
```

Constraints (enforced by the schema):
- `endTimeMs > startTimeMs`
- `durationMs ≤ 3 600 000` (1h)
- `sourceOffsetMs ≤ durationMs`
- `playback.src` must be an `http(s)` URL

#### `kind: "media"`

```ts
{
  kind: "media",
  mediaId: "asset-123",
  playback: { kind: "mp4", src: "https://…/video.mp4" }, // or kind: "hls"
  durationMs: 120000,             // optional
  posterSrc: "https://…/thumb.jpg",
  name: "Intro clip",
}
```

#### `kind: "audio-range"`

```ts
{
  kind: "audio-range",
  audioId: "track-9",
  startTimeMs: 0,
  endTimeMs: 30000,
  durationMs: 30000,
  playback: { kind: "audio", src: "https://…/music.m4a" }, // or kind: "hls"
  sourceOffsetMs: 0,
  name: "Background music",
}
```

If `playback.kind !== "hls"`, the `src` must end in a known audio extension (`.mp3`, `.wav`, `.m4a`, `.aac`, `.ogg`, `.m3u8`).

### `EDITOR_CLEAR_PROJECT`

Wipe all tracks and reset the timeline.

```ts
{
  type: "EDITOR_CLEAR_PROJECT",
  requestId: crypto.randomUUID(), // optional — echoed back
}
```

## Outbound messages — what you receive

Schemas live in `@video-editor/contract/iframe/to-parent`. Always validate incoming messages before acting on them.

### `EDITOR_READY`

```ts
{ type: "EDITOR_READY" }
```

Fires once after the iframe finishes initializing. Queue any pending sends until you see this.

### `EDITOR_PREVIEW_ITEM_ADDED`

Ack for `EDITOR_ADD_PREVIEW_ITEM`.

```ts
{
  type: "EDITOR_PREVIEW_ITEM_ADDED",
  requestId?: string,    // echoed from request, if you sent one
  itemId: "item-abc",    // the timeline item id
}
```

### `EDITOR_PREVIEW_ITEM_REJECTED`

Nack for `EDITOR_ADD_PREVIEW_ITEM`.

```ts
{
  type: "EDITOR_PREVIEW_ITEM_REJECTED",
  requestId?: string,
  reason: "<human-readable error>",
}
```

### `EDITOR_PROJECT_CLEARED`

Ack for `EDITOR_CLEAR_PROJECT`.

### `EDITOR_MEDIA_SAVED`

Fires when the user exports a rendered video. The render itself happens asynchronously on the server; this message confirms the parent that the export has been saved per the user's selections.

```ts
{
  type: "EDITOR_MEDIA_SAVED",
  url: "https://…/rendered.mp4",
  mediaId: "media-xyz",
  mediaName: "My Edit",
  downloadToComputer: false,
  saveToPersonalChannel: true,
  selectedUnitChannelIds: ["unit-1"],
  exportType: "mp4",        // or "webp"
  items: [...],             // savedMediaItemSchema[]
}
```

If you also subscribe to AMQP events, the same `mediaId`/`mediaName`/`exportType`/`items` payload appears in the `export.started` event under `data` — see [Event Consumers](event-consumers.md).

## Worked example

Full parent-side bridge using `safeParse`:

```ts
import {
  editorAddPreviewItemMessageSchema,
  type EditorAddPreviewItemMessage,
} from "@video-editor/contract/iframe/from-parent";
import {
  editorToParentMessageSchema,
} from "@video-editor/contract/iframe/to-parent";

const editorOrigin = "https://editor.example.com";
const iframe = document.querySelector<HTMLIFrameElement>("iframe#editor")!;

// 1. Wait for EDITOR_READY before sending.
let ready = false;
const pending: EditorAddPreviewItemMessage[] = [];

window.addEventListener("message", (event) => {
  if (event.source !== iframe.contentWindow) return;
  if (event.origin !== editorOrigin) return;

  const parsed = editorToParentMessageSchema.safeParse(event.data);
  if (!parsed.success) return;

  const msg = parsed.data;
  switch (msg.type) {
    case "EDITOR_READY":
      ready = true;
      pending.splice(0).forEach(send);
      break;
    case "EDITOR_PREVIEW_ITEM_ADDED":
      console.log("added", msg.itemId, "for requestId", msg.requestId);
      break;
    case "EDITOR_PREVIEW_ITEM_REJECTED":
      console.warn("rejected", msg.reason);
      break;
    case "EDITOR_PROJECT_CLEARED":
      console.log("cleared");
      break;
    case "EDITOR_MEDIA_SAVED":
      console.log("export saved", msg.url, msg.mediaName);
      break;
  }
});

function send(msg: EditorAddPreviewItemMessage) {
  const valid = editorAddPreviewItemMessageSchema.safeParse(msg);
  if (!valid.success) throw new Error("invalid outbound message");
  iframe.contentWindow!.postMessage(msg, editorOrigin);
}

// 2. Add a preview item once ready.
const message: EditorAddPreviewItemMessage = {
  type: "EDITOR_ADD_PREVIEW_ITEM",
  requestId: crypto.randomUUID(),
  payload: {
    kind: "recording-range",
    channelId: "channel-42",
    startTimeMs: Date.now() - 60_000,
    endTimeMs: Date.now(),
    durationMs: 60_000,
  },
};
if (ready) send(message);
else pending.push(message);
```

## Working harness in this repo

`apps/iframe-demo` (Angular 21) is a development harness for this protocol. It loads the editor in a draggable iframe, sends `EDITOR_ADD_PREVIEW_ITEM` and `EDITOR_CLEAR_PROJECT`, and displays both the outgoing payload and the responses. Use it to validate your message shapes interactively. See [architecture/apps/iframe-demo](../architecture/apps/iframe-demo.md).

## Auth — the short version

You do **not** send the auth token via `postMessage`. The editor and its server share a registrable domain (in production, a gateway routes both; in dev, the Vite proxy does). Same-origin `fetch` from the iframe carries the `HttpOnly` `ztube-token` cookie automatically. The server reads it from the inbound `Cookie` header and forwards it upstream to Core. The parent app never touches the token.

See [ADR 0003](../architecture/adr/0003-iframe-auth-via-httponly-cookie.md) for the rationale.
