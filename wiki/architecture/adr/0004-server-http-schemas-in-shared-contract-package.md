# 0004 — Server HTTP schemas live in the shared contract package

- Status: Accepted
- Date: 2026-06-01

## Context

`@video-editor/contract` is shared with an external (parent app) team that embeds the editor iframe. The package already owns:

- iframe postMessage schemas (parent ↔ editor)
- AMQP event envelopes (server → RabbitMQ)

`apps/server` previously kept its own HTTP route schemas next to each feature (`features/<feature>/adapters/inbound/http/*.schema.ts`) plus value types in `shared/domain/` (`OverlayType`, `TimeRange`, `VideoMetadata`, the `render-types` barrel). That follows the usual hexagonal convention "each feature owns its schemas".

But:

1. External teams reading `@video-editor/contract` had no way to tell what's "their" surface area vs the editor team's. Anything dragged in via grep looked equally public.
2. The editor frontend and the editor server share the same schemas (`designPayloadSchema`, `editVideoRequestSchema`, etc.) but historically duplicated or copy-pasted the types. A single source of truth was missing.
3. New hires kept asking "where do I find the type for X?". Three plausible answers per feature.

## Decision

Move every HTTP route schema and every shared HTTP value type out of `apps/server` and into `@video-editor/contract/internal/<feature>`. The contract package becomes the **single home for all editor-team type contracts**, organised into four explicit buckets:

| Bucket | Subpath | Audience |
|---|---|---|
| Parent → editor | `iframe/from-parent` | External + editor frontend |
| Editor → parent | `iframe/to-parent` | External + editor frontend |
| RabbitMQ events | `events` | External consumers |
| Editor server HTTP | `internal/<feature>` | **`apps/server` only** |

External teams know on sight that `/internal/*` is not for them.

All TS types in the package come from `z.infer<typeof schema>`.

## Consequences

**Good**

- One place to look for any type contract owned by the editor team.
- External teams can't accidentally couple to `/internal/*` — the subpath name is the warning.
- `apps/server` and `apps/frontend` can both import the same `designPayloadSchema`, `editVideoRequestSchema`, `OverlayType`, etc. without duplication.
- No drift between Zod schema and TS type — `z.infer` is the only source.

**Bad / Surprising**

- Breaks the usual hexagonal "each feature owns its schemas" guideline. `apps/server`'s features now point outward at the contract package for their inbound HTTP schemas.
- Adds a hard build-order edge: `@video-editor/contract` must build before `apps/server` type-checks. (Already true for the iframe/events subpaths — same build step.)
- The contract package no longer maps 1:1 to "external surface area". `/internal/*` is internal-only but lives in the same `node_modules/@video-editor/contract` install.

## Alternatives Considered

1. **Keep schemas in `apps/server`, add CLAUDE.md notes about scope.** Rejected — relies on the external team reading docs instead of seeing the boundary in the import path.
2. **Create a separate `@video-editor/server-contract` workspace package.** Rejected — adds workspace overhead for a package that no other workspace imports. The `/internal/*` subpath gives the same isolation with one less package.
3. **Inline shared schemas in `apps/frontend` and `apps/server` independently.** Rejected — that's the duplication problem we already have.
