# @video-editor/contract

Shared contracts for the video editor: the iframe `postMessage` protocol and the AMQP event envelopes published to RabbitMQ. Pure Zod schemas and TypeScript types — no runtime network calls.

## Overview

Three import surfaces, one package:

- **`@video-editor/contract/iframe`** — `postMessage` protocol between the editor iframe (`/editor/embed`) and any host page.
- **`@video-editor/contract/events`** — versioned `Envelope<T>` and Zod schemas for events published by `apps/server` to the `video-editor` topic exchange.
- **`@video-editor/contract`** (root) — convenience re-export of `iframe/*` plus shared payload types (`SavedMediaItem`, `SavedMediaPayload`).

> [!NOTE]
> External teams consume `/events` from their own services. Treat the event schemas as a public API and follow the [versioning policy](src/events/README.md#versioning-policy) when changing them.

## Installation

Workspace dependency inside the monorepo:

```json
{
  "dependencies": {
    "@video-editor/contract": "workspace:*"
  }
}
```

## Subpath Exports

| Import path | Purpose |
|---|---|
| `@video-editor/contract` | Iframe protocol + shared payload types (re-export) |
| `@video-editor/contract/iframe` | Iframe `postMessage` schemas, types, factories |
| `@video-editor/contract/iframe/mocks` | Fixture builders for iframe messages (test-only) |
| `@video-editor/contract/events` | AMQP envelope, routing-key constants, per-event schemas |
| `@video-editor/contract/events/mocks` | Fixture builders for event envelopes (test-only) |

Mocks live behind separate subpaths so test helpers stay out of production bundles.

## Iframe Protocol

```
Host page                        Editor iframe (at /editor/embed)
─────────────────────────────────────────────────────────────────
                                 ──EDITOR_READY──────────────────▶
◀── EDITOR_ADD_PREVIEW_ITEM ─────
         ─────────────── preview_item_added / preview_item_rejected ──▶
◀── EDITOR_CLEAR_PROJECT ────────
         ─────────────────────────────────── project_cleared ──────▶
◀── EDITOR_SET_AUTH ─────────────
         ────────────────────────────────────── media_saved ──────▶
```

### Validate incoming messages

```ts
import { parentToEditorMessageSchema } from "@video-editor/contract/iframe";

const result = parentToEditorMessageSchema.safeParse(event.data);
if (!result.success) return;
// result.data is fully typed
```

### Build response messages

```ts
import {
  createPreviewItemAddedMessage,
  createPreviewItemRejectedMessage,
  createProjectClearedMessage,
  createMediaSavedMessage,
} from "@video-editor/contract/iframe";

window.parent.postMessage(createPreviewItemAddedMessage({ itemId }), targetOrigin);
```

### `PreviewItemPayload`

Discriminated union on `kind`:

| `kind` | Description |
|---|---|
| `recording-range` | A recording segment with a time range |
| `media` | A generic media asset |
| `audio-range` | An audio segment with a time range |

### Mocks

```ts
import { mockEditorReadyMessage } from "@video-editor/contract/iframe/mocks";
```

## Events

Single topic exchange `video-editor`. Three routing keys today:

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

See [`src/events/README.md`](src/events/README.md) for the full consumer onboarding doc — envelope shape, AMQP headers, queue binding, dead-lettering, versioning, and delivery guarantees.

## Shared Payloads

Re-exported from the root for use by both iframe and event consumers:

```ts
import {
  type SavedMediaItem,
  type SavedMediaPayload,
  savedMediaItemSchema,
  savedMediaPayloadSchema,
} from "@video-editor/contract";
```

## Source Structure

```
src/
├── index.ts                 # Root barrel — re-exports iframe + shared
├── iframe/
│   ├── index.ts             # iframe barrel
│   ├── messages.ts          # Message type definitions
│   ├── payloads.ts          # Payload interfaces
│   ├── schemas.ts           # Zod validation schemas
│   ├── helpers.ts           # Factory functions
│   ├── mocks.ts             # Fixture builders
│   └── helpers.test.ts
├── events/
│   ├── index.ts             # events barrel
│   ├── envelope.ts          # Envelope<T> + header-key constants
│   ├── export.ts            # v1 schemas for export.*
│   ├── mocks.ts             # Fixture envelopes
│   ├── export.test.ts
│   └── README.md            # External-team onboarding doc
└── shared/
    ├── saved-media.ts       # SavedMediaItem, SavedMediaPayload
    └── saved-media.test.ts
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

| Package | Purpose |
|---|---|
| `zod` v4 | Runtime schema validation and type inference |
