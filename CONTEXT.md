# Domain Glossary

> Single-context repo. See `docs/adr/` for architecture decisions.

## HTTP Schema Validation

Zod is the single validation library for both env config and HTTP request schemas. TypeBox is not used. Type inference uses `z.infer<typeof schema>`.

→ See [ADR 0001](docs/adr/0001-zod-over-typebox.md)

## Contract Package Buckets

`@video-editor/contract` exposes four explicit subpaths so external teams can see what's theirs vs the editor team's:

**from-parent** — parent app → editor postMessage (`EDITOR_ADD_PREVIEW_ITEM`, `EDITOR_CLEAR_PROJECT`). Subpath: `@video-editor/contract/iframe/from-parent`.

**to-parent** — editor → parent postMessage (`EDITOR_PREVIEW_ITEM_ADDED`, `EDITOR_PREVIEW_ITEM_REJECTED`, `EDITOR_PROJECT_CLEARED`, `EDITOR_READY`, `EDITOR_MEDIA_SAVED`). Subpath: `@video-editor/contract/iframe/to-parent`.

**events** — server publishes to the `video-editor` topic exchange (`export.started`, `export.completed`, `export.failed`). Subpath: `@video-editor/contract/events`.

**internal** — editor server's own HTTP API schemas (upload, edit-video, render, editor-export). Subpath: `@video-editor/contract/internal/<feature>`. External teams must not import — see [ADR 0004](docs/adr/0004-server-http-schemas-in-shared-contract-package.md).

Every TS type in the package is `z.infer<typeof schema>` so schemas and types cannot drift.

## Messaging

**Publish** — server hands an event envelope to the broker on the `video-editor` topic exchange. Considered successful only when the broker confirms it (publisher confirms). A publish that the broker never acks, or that the broker returns as unrouted, is a failure the server must log and meter.

**Unrouted** — broker received the message but no queue is bound to a matching routing key. Surfaces as a return when published with `mandatory: true`. Treated as a publish failure on the server side.

**Broker Ack** — the broker's confirm that it accepted (and routed) the message. The server's responsibility ends here. Whether a consumer ultimately processes the message is the consuming team's concern, not the server's.

**Event Envelope** — versioned wrapper around the domain payload: `{ eventName, eventVersion, occurredAt, traceparent, data }`. Same shape stamped into AMQP headers (`x-event-name`, `x-event-version`) so subscribers can filter without parsing the body.

## Preview & VOD

**Core Service** — external HTTP service hosting `/private/users/me`, channel list, and `/private/channels/:id/play`. Mocked locally by `apps/core-mock` (port 8002).

**VOD Service** — external HTTP service hosting MPD-generate + DASH segment streaming. Mocked locally by `apps/mock-vod` (port 5050). In production, Core and VOD share a domain behind a reverse proxy; locally they are two separate ports.

**Mock VOD** — `apps/mock-vod`. Fastify app emulating the real VOD HTTP contract (manifest + segments + `vod-token` validation). The editor server runs the same code path against Mock VOD and real VOD — no demo branches in `apps/server`.

**Channel Play API** — `GET /private/channels/:id/play?start&end` on Core. Returns `{ url, timeRanges, token }`:
- `url` — MPD document URL. Relative in prod (resolved against `CORE_BASE_URL`), absolute in dev (mock VOD lives on a different port from mock Core).
- `timeRanges[0][0]` — wall-clock anchor (ms) for the first segment (`segmentStartTimeMs`). The HLS pipeline uses this, **not** MPD `presentationTimeOffset`.
- `token` — VOD Token.

**VOD Token** — short-lived (~10 min) credential issued by Core's Channel Play API and validated by VOD on both MPD-generate and segment fetches. Cross-service trust: in prod, Core and VOD share state internally; in mocks, `apps/core-mock` POSTs `/__internal/register-token` to `apps/mock-vod`. **Footgun:** the token is baked into the preview playlist URLs, so a stored playlist outlasts its token — pause/idle past the TTL and segments 401.

**MPD Base** — effective base URL for resolving DASH segment templates. Per ISO/IEC 23009-1, computed as `resolve(periodBaseURL, resolve(mpdBaseURL, mpdDocumentURL))` (RFC3986). `segmentStartTimeMs` (from `/play.timeRanges[0][0]`) is the wall-clock anchor; `presentationTimeOffset` from the MPD is informational only in this HLS pipeline.

→ See [ADR 0002](docs/adr/0002-mock-vod-as-separate-app.md)
