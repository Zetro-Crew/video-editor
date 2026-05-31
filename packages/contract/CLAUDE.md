# contract Package

> **Closed network deployment:** Consumed by apps running in air-gapped environments. No runtime network calls — purely type definitions and Zod schemas.
>
> **Keep this file updated:** Update whenever message types, schemas, exports, or routing keys change.

Published as `@video-editor/contract`. Defines:
- **iframe protocol** — Zod schemas + TS types for `postMessage` between the editor and its parent (`./iframe`).
- **AMQP events** — versioned envelope + Zod schemas for events published by `apps/server` to RabbitMQ (`./events`).
- **shared** — reusable payload types (`SavedMediaItem`, `SavedMediaPayload`) used by both iframe and events.

## Commands

```bash
pnpm build        # tsc -p tsconfig.json (required before test)
pnpm test         # pnpm build && node --test dist/**/*.test.js
pnpm type-check   # tsc -p tsconfig.json --noEmit
pnpm lint         # biome check .
pnpm format       # biome format . --write
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
│   ├── mocks.ts             # Mock fixtures
│   └── helpers.test.ts      # Test suite
├── events/
│   ├── index.ts             # events barrel
│   ├── envelope.ts          # Envelope<T> + header-key constants
│   ├── export.ts            # v1 schemas for export.started/completed/failed
│   ├── mocks.ts             # Mock envelopes
│   ├── export.test.ts       # Schema tests
│   └── README.md            # External-team onboarding doc
└── shared/
    ├── saved-media.ts       # SavedMediaItem, SavedMediaPayload
    └── saved-media.test.ts  # Schema tests
```

## Package Exports

```json
"exports": {
  ".":               "./dist/index.js",
  "./iframe":        "./dist/iframe/index.js",
  "./iframe/mocks":  "./dist/iframe/mocks.js",
  "./events":        "./dist/events/index.js",
  "./events/mocks":  "./dist/events/mocks.js"
}
```

## Key Exports

### `@video-editor/contract/iframe`

- `parentToEditorMessageSchema`, `editorToParentMessageSchema` — Zod schemas
- `ParentToEditorMessage`, `EditorToParentMessage` and subtypes
- `PreviewItemPayload` union (`recording-range`, `media`, `audio-range`)
- `EditorReadyMessage`, `EditorMediaSavedMessage`
- Factories: `createPreviewItemAddedMessage`, `createPreviewItemRejectedMessage`, `createProjectClearedMessage`, `createMediaSavedMessage`

### `@video-editor/contract/events`

- `EXCHANGE_NAME` (`"video-editor"`), routing-key constants (`EXPORT_STARTED`, `EXPORT_COMPLETED`, `EXPORT_FAILED`)
- Version constants (`EXPORT_STARTED_V1` …)
- AMQP header constants (`X_EVENT_NAME`, `X_EVENT_VERSION`)
- `Envelope<T>` type + `envelopeSchema(dataSchema)` factory
- Per-event Zod schemas + TS types: `exportStartedEnvelopeSchema`, `ExportStartedData`, etc.
- `mockExportStartedEnvelope` etc. via `./events/mocks`

See [`src/events/README.md`](src/events/README.md) for the consumer-side onboarding doc.

### Root (`@video-editor/contract`)

Re-exports `iframe/*` + `shared/*` for convenience.

## Dependencies

- `zod` v4 — runtime validation
