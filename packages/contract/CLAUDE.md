# contract Package

> **Closed network deployment:** Consumed by apps running in air-gapped environments. No runtime network calls — purely type definitions and Zod schemas.
>
> **Keep this file updated:** Update whenever message types, schemas, exports, or routing keys change.

Published as `@video-editor/contract`. Four subpath buckets — no root barrel, no separate `mocks` exports.

**Current major:** `0.2.0`. Bumped from `0.1.0` when the iframe parent → editor union dropped `imagePayloadSchema` + `mediaPayloadSchema` in favor of a top-level `EDITOR_ADD_MEDIA` message — see `docs/adr/0007-stored-media-id-only-intake.md`. Stored-media replies echo `mediaId`; recording-range / audio-range replies still use `requestId`. Two correlation patterns coexist.

| Subpath | Purpose | Audience |
|---|---|---|
| `./iframe/from-parent` | Parent → editor postMessage | Parent team + editor frontend |
| `./iframe/to-parent` | Editor → parent postMessage | Parent team + editor frontend |
| `./events` | RabbitMQ events (`video-editor` topic exchange) | Event consumers |
| `./internal/upload` | `POST /upload/signed-url` body/response schemas | **`apps/server` only** |
| `./internal/edit-video` | Overlay + source Zod schemas reused by the worker DSL (`overlaySchema`, `sourceSchema`, `audioSourceSchema`, per-overlay variants) | **`apps/server` only** |
| `./internal/render` | `POST /render` body/response schemas + `designPayloadSchema` | **`apps/server` only** |
| `./internal/preview` | `POST /editor/preview-source` + `GET /editor/segment` body/query schemas | **`apps/server` only** |
| `./internal/shared` | Shared value types: `OverlayType` enum, `TimeRange`, `VideoMetadata`, `ErrorResponse` | **`apps/server` only** |

`SavedMediaItem` / `SavedMediaPayload` are re-exported from both `iframe/to-parent` and `events` (same shape used in `EDITOR_MEDIA_SAVED` and `export.started.data`). Internally they live in `src/shared/saved-media.ts` — not exposed directly via `package.json`.

**One source of truth:** every TS type is `z.infer<typeof schema>`. No hand-written types living next to schemas.

## Commands

```bash
pnpm build        # tsc -p tsconfig.json (required before test)
pnpm test         # pnpm build && node --test dist/**/*.test.js
pnpm type-check   # tsc -p tsconfig.json --noEmit
pnpm lint         # biome check . --write
```

## Source Structure

```
src/
├── __tests__/exports.test.ts    # smoke test that every subpath in package.json resolves
├── iframe/
│   ├── from-parent/
│   │   ├── __tests__/{schemas,helpers}.test.ts
│   │   ├── schemas.ts           # Zod + z.infer types
│   │   ├── helpers.ts           # parse / safeParse wrappers
│   │   ├── mocks.ts             # internal fixtures
│   │   └── index.ts
│   └── to-parent/
│       ├── __tests__/{schemas,helpers}.test.ts
│       ├── schemas.ts
│       ├── helpers.ts           # create* factories
│       ├── mocks.ts
│       └── index.ts             # + re-exports SavedMedia* from ../shared
├── events/
│   ├── __tests__/export.test.ts
│   ├── envelope.ts
│   ├── export.ts
│   ├── mocks.ts
│   ├── README.md
│   └── index.ts                 # + re-exports SavedMedia* from ../shared
├── shared/                      # NOT in package.json exports
│   ├── __tests__/saved-media.test.ts
│   └── saved-media.ts           # SavedMediaItem / SavedMediaPayload (z.infer)
└── internal/
    ├── upload/{schemas,index}.ts
    ├── edit-video/{schemas,index}.ts
    ├── preview/{schemas,index}.ts
    ├── render/{design-payload.schema,render-request.schema,index}.ts
    └── shared/{overlay-type,time-range,video-metadata,error-response,index}.ts
```

## Package Exports (wildcards)

```json
{
  "./iframe/*":   "./dist/iframe/*/index.js",
  "./events":     "./dist/events/index.js",
  "./internal/*": "./dist/internal/*/index.js"
}
```

Three patterns cover every public surface. Mocks live in `mocks.ts` next to each bucket but are **not** exported via package.json — tests import them with relative paths only.

## Dependencies

- `zod` v4 — runtime validation. Every TS type is `z.infer<typeof schema>`.
