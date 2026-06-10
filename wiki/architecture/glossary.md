# Domain Glossary

> Single-context repo. See `docs/adr/` for architecture decisions.

## HTTP Schema Validation

Zod is the single validation library for both env config and HTTP request schemas. TypeBox is not used. Type inference uses `z.infer<typeof schema>`.

→ See [ADR 0001](adr/0001-zod-over-typebox)

## Contract Package Buckets

`@video-editor/contract` exposes four explicit subpaths so external teams can see what's theirs vs the editor team's:

**from-parent** — parent app → editor postMessage (`EDITOR_ADD_PREVIEW_ITEM`, `EDITOR_CLEAR_PROJECT`). Subpath: `@video-editor/contract/iframe/from-parent`.

**to-parent** — editor → parent postMessage (`EDITOR_PREVIEW_ITEM_ADDED`, `EDITOR_PREVIEW_ITEM_REJECTED`, `EDITOR_PROJECT_CLEARED`, `EDITOR_READY`, `EDITOR_MEDIA_SAVED`). Subpath: `@video-editor/contract/iframe/to-parent`.

**events** — server publishes to the `video-editor` topic exchange (`export.started`, `export.completed`, `export.failed`). Subpath: `@video-editor/contract/events`.

**internal** — editor server's own HTTP API schemas (upload, edit-video, render, editor-export). Subpath: `@video-editor/contract/internal/<feature>`. External teams must not import — see [ADR 0004](adr/0004-server-http-schemas-in-shared-contract-package).

Every TS type in the package is `z.infer<typeof schema>` so schemas and types cannot drift.

## Messaging

**Publish** — server hands an event envelope to the broker on the `video-editor` topic exchange. Considered successful only when the broker confirms it (publisher confirms). A publish that the broker never acks, or that the broker returns as unrouted, is a failure the server must log and meter.

**Unrouted** — broker received the message but no queue is bound to a matching routing key. Surfaces as a return when published with `mandatory: true`. Treated as a publish failure on the server side.

**Broker Ack** — the broker's confirm that it accepted (and routed) the message. The server's responsibility ends here. Whether a consumer ultimately processes the message is the consuming team's concern, not the server's.

**Event Envelope** — versioned wrapper around the domain payload: `{ eventName, eventVersion, occurredAt, traceparent, data }`. Same shape stamped into AMQP headers (`x-event-name`, `x-event-version`) so subscribers can filter without parsing the body.

**Broker TLS** — closed-network broker uses client mutual TLS. `QUEUE_URL` scheme drives the behavior: `amqps://` (prod) → process reads three PEM files at boot from hardcoded paths (`/bundle.pem` for the private CA, `/tmp/certificates/rabbitmq/rabbit_cert.pem` + `rabbit_key.pem` for client identity) and passes them as socket options to every `amqplib.connect()`. `amqp://` (dev) → plain connect, no file reads. URL carries no userinfo in prod — the broker authenticates clients by certificate.

## Editor Composition

**IDesign** — the serialized editor state: tracks, track items, canvas size, FPS. This is the payload the frontend sends to `/render`. It is the single source of truth for what the rendered output will look like.

**Render Job** — an async server-side job (keyed by `jobId` in Redis) that runs FFmpeg against an IDesign and stores the encoded output in S3. States: `PROCESSING → COMPLETED | FAILED | CANCELLED`. Frontend polls `GET /render?id=<jobId>`.

**Edit-Video Job** — a separate async FFmpeg job (also Redis-tracked) that processes a raw source file — not a full IDesign. Used for trimming, cutting, and format conversion of a single source. States: `PROCESSING → COMPLETED | FAILED`.
## Render Pipeline

**Render Worker** — separate `video-editor-worker` Deployment, same image as the API, entrypoint `apps/server/src/worker.ts`. Consumes `render.requested` and runs FFmpeg. Probe + metrics on port 8081. See [ADR 0005](adr/0005-render-worker-deployment).

**Render Command** — internal AMQP message published by `POST /render` to the `video-editor.commands` direct exchange with routing key `render.requested`. Envelope wraps the full render input (sources, overlays, audio, format, optional `saveMetadata`). Server-internal — not part of the public `@video-editor/contract` surface.

**render.requested queue** — quorum, durable, `x-delivery-limit=5`, `x-overflow=reject-publish`, `x-max-length=10000`. Quorum + per-message delivery counter is what makes broker-side retry work without the server tracking attempts.

**Dead-Letter Queue** — `render.dead`, bound to DLX `video-editor.commands.dlx`. Receives messages whose delivery count exceeds `x-delivery-limit`. A consumer co-located in the worker process reads it and publishes terminal `export.failed { error: "max retries exceeded" }`, so subscribers always see a terminal event for every `jobId` that left the API.

**Command publish failure** — `publishCommand` retries 3× with backoff and a per-attempt confirm-timeout race. On exhaustion the controller returns 503 (not the swallow-on-exhaustion behavior used for outbound events) — the client must know enqueue failed.

**Idempotent re-delivery** — the worker derives a deterministic S3 output key from `jobId`. If `storage.exists(outputKey)` is true on consume, it publishes `export.completed` with the existing URL and acks without re-running FFmpeg. Protects against a worker SIGKILL between upload and ack.

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

**Channel Range** — a preview source type (`{ type: "channel-range", channelId, startTimeMs, endTimeMs }`) that references a time window of a live channel recording. The server resolves it by calling Core's Channel Play API, fetching the DASH MPD, and assembling an HLS Playlist. The editor always works with the resolved HLS Playlist, never directly with the Channel Range.

**HLS Playlist** — a server-assembled `.m3u8` file built from a DASH MPD. Not a native recording format — the editor server synthesizes it so the browser's HLS stack can play DASH-origin content without needing MSE/DASH.js. Stored in S3 after assembly; URL is presigned.

**Segment Proxy** — the `GET /editor/segment` endpoint. Browsers cannot attach custom `vod-token` headers to media segment fetches (HLS). The server acts as a proxy: it validates the HMAC-signed segment URL, injects the `vod-token` header, and streams the bytes from VOD to the browser.

→ See [ADR 0002](adr/0002-mock-vod-as-separate-app)
