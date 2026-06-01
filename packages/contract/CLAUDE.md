# contract Package

> **Closed network deployment:** Consumed by apps running in air-gapped environments. No runtime network calls — purely type definitions and Zod schemas.
>
> **Keep this file updated:** Update whenever message types, schemas, exports, or routing keys change.

Published as `@video-editor/contract`. Three subpath patterns — no root barrel, no separate `mocks` exports.

| Subpath | Purpose | Audience |
|---|---|---|
| `./iframe/from-parent` | Parent → editor postMessage | Parent team + editor frontend |
| `./iframe/to-parent` | Editor → parent postMessage | Parent team + editor frontend |
| `./events` | RabbitMQ events (`video-editor` topic exchange) | Event consumers |
| `./internal/<feature>` | Server-owner HTTP API schemas | **`apps/server` only** |

`SavedMediaItem` / `SavedMediaPayload` are re-exported from both `iframe/to-parent` and `events` (same shape used in `EDITOR_MEDIA_SAVED` and `export.started.data`). Internally they live in `src/shared/saved-media.ts` — not exposed directly via `package.json`.

**One source of truth:** every TS type is `z.infer<typeof schema>`. No hand-written types living next to schemas.

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
├── iframe/
│   ├── from-parent/
│   │   ├── __tests__/schemas.test.ts
│   │   ├── schemas.ts           # Zod + z.infer types
│   │   ├── helpers.ts           # parse / safeParse wrappers
│   │   ├── mocks.ts             # internal fixtures
│   │   └── index.ts
│   └── to-parent/
│       ├── __tests__/schemas.test.ts
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
    ├── render/{design-payload.schema,index}.ts
    ├── editor-export/{types,index}.ts
    └── shared/{overlay-type,time-range,video-metadata,index}.ts
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
