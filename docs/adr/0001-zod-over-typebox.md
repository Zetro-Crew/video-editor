# ADR 0001: Zod as the single validation library

**Status:** Accepted  
**Date:** 2026-05-23

## Context

The server used two validation libraries simultaneously:
- **Zod** — for env config (`src/config/env.ts`)
- **TypeBox** — for HTTP request/response schemas (2 features, 15 schemas)

Both served the same purpose: runtime validation + TypeScript type inference.

## Decision

Consolidate on **Zod** for all validation. Replace `@sinclair/typebox` and `@fastify/type-provider-typebox` with `fastify-type-provider-zod`.

## Tradeoffs

| | TypeBox | Zod |
|--|---------|-----|
| Schema format | JSON Schema (AJV-compatible) | Proprietary |
| OpenAPI interop | Native | Requires conversion |
| TS inference | `Static<typeof schema>` | `z.infer<typeof schema>` |
| Validation perf | AJV (faster) | Zod (slower, negligible at this scale) |
| Already present | No (was added for HTTP only) | Yes (env config) |

TypeBox's JSON Schema output would matter if this server needed to auto-generate OpenAPI docs. It does not. The runtime is a closed-network video editing server, not a public API.

## Consequences

- One dependency instead of two for validation
- All type inference via `z.infer<>`
- `fastify-type-provider-zod` handles Fastify v5 + Zod v4 integration
- HTTP schemas: `edit-video.schema.ts`, `upload.schema.ts`
