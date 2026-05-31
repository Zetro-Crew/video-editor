# ADR 0002 — Mock VOD as a separate app (`apps/mock-vod`)

## Status

Accepted — 2026-06-01.

## Context

Production runs in a closed (air-gapped) network. The video-editor's preview pipeline depends on two upstream HTTP services:

- **Core** — issues `/private/channels/:id/play?start&end`, returning `{ url, timeRanges, token }` where `token` is a short-lived `vod-token`.
- **VOD** — serves the MPD document and DASH segments. Validates the `vod-token` on every request.

In prod the two services share a domain behind a reverse proxy. From the editor server's perspective they look like one HTTP target — but internally they are two services with cross-service token trust.

Neither is reachable from a developer laptop. Before this ADR, `apps/server` had **two** outbound adapters for the same port:

- `HttpChannelPlayApiAdapter` — real-prod path; untestable locally.
- `DemoChannelPlayApiAdapter` + an in-server `/editor/demo-assets/*` route — a shortcut that skipped the `vod-token` flow entirely.

The demo branch diverged from prod silently. Bugs that broke prod (e.g., `BaseURL` resolution, missing `vod-token` header, the multi-range assumption) passed on demo.

## Decision

Emulate the real upstream VOD HTTP contract via a **separate Fastify app** at `apps/mock-vod` (port 5050). Pair it with `apps/core-mock` (port 8002), which now mints real `vod-token`s and registers them with `apps/mock-vod` over an internal `POST /__internal/register-token`.

The editor server runs **one** outbound adapter (`HttpPreviewSourceAdapter`) against both the mocks and real prod. No demo branches survive in `apps/server`.

## Alternatives Considered

1. **In-server demo route** (the status quo we replaced). Rejected — silently diverges from prod.
2. **Bundle the VOD mock into `apps/core-mock`.** Rejected — collapses the cross-service boundary that exists in prod. Two mocks per two upstream services keeps each mock honest to its real contract.
3. **Emulate the prod reverse proxy locally** (single-port frontage). Rejected — extra moving part, hides the very cross-service trust we want to surface.

## Consequences

Positive:
- One code path against mocks and prod. Prod-only bugs (BaseURL resolution, multi-range, token TTL) surface locally.
- Cross-service token coordination (`/__internal/register-token`) mirrors real Core/VOD trust.
- The `vod-token` TTL footgun (stored playlists outlasting their token) is reproducible on a dev box.

Negative:
- One extra dev-time process. Mitigated by Turborepo running it automatically under `pnpm dev`.
- Test setup is a touch heavier: E2E tests boot both mocks on ephemeral ports.
