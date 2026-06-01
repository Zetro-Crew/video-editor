# @video-editor/contract

Shared contracts for the video editor. Pure Zod schemas + TypeScript types — no runtime network calls. Every TS type is derived via `z.infer<typeof schema>` so schemas and types never drift.

## Four Subpaths

| Subpath | Direction / Owner | Who imports |
|---|---|---|
| `@video-editor/contract/iframe/from-parent` | Parent **sends** to editor | Parent app + editor frontend |
| `@video-editor/contract/iframe/to-parent` | Editor **sends** to parent | Parent app + editor frontend |
| `@video-editor/contract/events` | Server **publishes** to RabbitMQ | Anyone consuming events |
| `@video-editor/contract/internal/<feature>` | Editor server's own HTTP API schemas | **`apps/server` only** — external teams must not import |

`SavedMediaItem` / `SavedMediaPayload` are re-exported from both `iframe/to-parent` and `events` (same shape used in `EDITOR_MEDIA_SAVED` and `export.started.data`). Pick whichever subpath matches your context.

There is no root `@video-editor/contract` export. Every caller imports a subpath so the bucket they touch is explicit.

## Installation

```json
{ "dependencies": { "@video-editor/contract": "workspace:*" } }
```

## Iframe Protocol

```
Parent page                       Editor iframe (at /editor/embed)
─────────────────────────────────────────────────────────────────
                                  ──EDITOR_READY──────────────────▶
◀── EDITOR_ADD_PREVIEW_ITEM ──────
         ─────────────── EDITOR_PREVIEW_ITEM_ADDED / EDITOR_PREVIEW_ITEM_REJECTED ──▶
◀── EDITOR_CLEAR_PROJECT ─────────
         ─────────────────────────────────── EDITOR_PROJECT_CLEARED ──▶
         ────────────────────────────────────── EDITOR_MEDIA_SAVED ──▶
```

### Validate incoming messages (parent → editor)

```ts
import { parentToEditorMessageSchema } from "@video-editor/contract/iframe/from-parent";

const result = parentToEditorMessageSchema.safeParse(event.data);
if (!result.success) return;
// result.data is fully typed
```

### Build response messages (editor → parent)

```ts
import {
  createPreviewItemAddedMessage,
  createPreviewItemRejectedMessage,
  createProjectClearedMessage,
  createMediaSavedMessage,
} from "@video-editor/contract/iframe/to-parent";

window.parent.postMessage(createPreviewItemAddedMessage(itemId), targetOrigin);
```

### `PreviewItemPayload` (inbound)

Discriminated union on `kind`:

| `kind` | Description |
|---|---|
| `recording-range` | A recording segment with a time range |
| `media` | A generic media asset |
| `audio-range` | An audio segment with a time range |

## Events

Single topic exchange `video-editor`. Three routing keys:

| Routing key | Purpose |
|---|---|
| `export.started` | Render job started |
| `export.completed` | Render output uploaded |
| `export.failed` | Render job failed |

```ts
import {
  EXCHANGE_NAME,
  EXPORT_COMPLETED,
  exportCompletedEnvelopeSchema,
} from "@video-editor/contract/events";
```

See [`src/events/README.md`](src/events/README.md) for envelope shape, AMQP headers, queue binding, dead-lettering, versioning, delivery guarantees.

## Internal (server-owner only)

```ts
import { designPayloadSchema } from "@video-editor/contract/internal/render";
import { editVideoRequestSchema } from "@video-editor/contract/internal/edit-video";
import { getSignedUrlRequestSchema } from "@video-editor/contract/internal/upload";
import { OverlayType, type TimeRange } from "@video-editor/contract/internal/shared";
```

External consumers must not import `/internal/*`. See `docs/adr/0004-server-http-schemas-in-shared-contract-package.md`.

## Source Structure

```
src/
├── iframe/
│   ├── from-parent/        # Parent → editor (postMessage)
│   │   ├── __tests__/
│   │   ├── schemas.ts      # Zod + z.infer types
│   │   ├── helpers.ts
│   │   ├── mocks.ts
│   │   └── index.ts
│   └── to-parent/          # Editor → parent (postMessage)
│       ├── __tests__/
│       ├── schemas.ts
│       ├── helpers.ts
│       ├── mocks.ts
│       └── index.ts        # also re-exports SavedMedia* from ../shared
├── events/
│   ├── __tests__/
│   ├── envelope.ts
│   ├── export.ts
│   ├── mocks.ts
│   ├── README.md
│   └── index.ts            # also re-exports SavedMedia* from ../shared
├── shared/                 # internal-only — not in package.json exports
│   ├── __tests__/
│   └── saved-media.ts
└── internal/               # ⚠ server-owner only
    ├── upload/{schemas,index}.ts
    ├── edit-video/{schemas,index}.ts
    ├── render/{design-payload.schema,index}.ts
    ├── editor-export/{types,index}.ts
    └── shared/{overlay-type,time-range,video-metadata,index}.ts
```

## Commands

```bash
pnpm build        # tsc -p tsconfig.json (required before test)
pnpm test         # pnpm build && node --test dist/**/*.test.js
pnpm type-check   # tsc -p tsconfig.json --noEmit
pnpm lint         # biome check .
pnpm format       # biome format . --write
```

## Dependencies

- `zod` v4 — runtime validation. All TS types come from `z.infer<typeof schema>`.
