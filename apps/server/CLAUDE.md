# Server App

> **Closed network deployment:** This server runs in air-gapped environments. All FFmpeg binaries and S3 (MinIO) must be self-hosted. Do not introduce dependencies that phone home or fetch from public URLs at runtime.
>
> **Keep this file updated:** Update whenever features, dependencies, or architecture change.

Fastify + Node.js 22.18+. Two entrypoints share the same image and DI primitives:

- **API** — `src/index.ts`. Port **4001** (env `PORT`).
- **Worker** — `src/worker.ts`. Probe + metrics on port **8081** (env `WORKER_PROBE_PORT`).

TypeScript executed directly — no tsx/ts-node.

## Commands

```bash
pnpm dev          # node --env-file=.env --watch-path=./src src/index.ts
pnpm start        # node src/index.ts (production API)
pnpm test         # vitest run
pnpm type-check   # tsc --noEmit
pnpm lint         # biome check . --write

# Worker (same image, different entrypoint)
node --env-file=.env src/worker.ts
```

## Entry & Bootstrap

- `src/index.ts` — API entrypoint: calls `parseApiEnv()`, builds `System`, registers shutdown handlers.
- `src/worker.ts` — Worker entrypoint: calls `parseWorkerEnv()`, builds `Worker`, registers shutdown handlers.
- `src/bootstrap/system.ts` — `System` class for the API: orchestrates publisher `connect()` → `Server.start()` → mock-vod fixture-window probe (local dev only). Shutdown: server stop → publisher drain (5s) → publisher close.
- `src/bootstrap/container.ts` — `buildApiContainer` + `buildWorkerContainer`. API gets HTTP-facing services + `RenderCommandPort`; worker gets `VideoRenderUseCase`, `RenderRequestedConsumer`, `RenderDLQConsumer`.
- `src/bootstrap/server.ts` — `Server` class wrapped by `System`: Fastify plugins + controllers + `GET /health`.
- `src/bootstrap/worker.ts` — `Worker` class: opens AMQP consumers (each on its own channel), runs the probe server, drains in-flight work on SIGTERM.
- `src/bootstrap/workerProbeServer.ts` — `/health`, `/ready`, `/metrics` (Prometheus).
- `src/bootstrap/shutdown.ts` — `createShutdown()` factory: registers SIGTERM/SIGINT handlers, used by both entrypoints.
- `src/config/env.ts` — Zod-validated env schemas (`commonEnvSchema` / `apiEnvSchema` / `workerEnvSchema`) with defaults; exports `parseApiEnv` + `parseWorkerEnv`.

## Architecture: Hexagonal (Ports & Adapters)

```
src/
├── bootstrap/          # DI container, API server, worker
├── config/             # Env validation
├── infrastructure/     # Framework adapters (Fastify, FFmpeg, S3, AMQP)
├── shared/             # Cross-feature domain types + ports
└── features/           # Business features (see below)
    └── <feature>/
        ├── adapters/
        │   ├── inbound/http/   # HTTP controllers (Fastify plugins)
        │   ├── inbound/amqp/   # AMQP consumers (render only)
        │   └── outbound/       # FFmpeg, S3, HTTP, AMQP adapters
        ├── application/
        │   ├── use-cases/      # Orchestration
        │   ├── ports/outbound/ # Interfaces
        │   └── services/       # Domain services (where needed)
        └── domain/             # Domain logic/policies
```

### HTTP error handling

HTTP controllers must `throw new HttpError(...)` (from `@ztube/observability/fastify`) for all 4xx/5xx paths. Do not call `reply.status(4xx|5xx).send(...)` directly — it bypasses the observability `onError` hook and the structured error log line.

Response shape is `{ error: string }`. No `code` or `details` field in the body. Frontend branches on HTTP status, not an error-code field. (This is a tightening: the previous `setErrorHandler` validation branch also emitted `details: error.validation` in the body — that field is now log-only.)

`details` is log-only — it appears as `err.details` in logs via Pino's `stdSerializers.err`, never serialized into the response.

Domain/infra error types (`UploadTooLargeError`, `PublishExhaustedError`, `InvalidJobIdError`, etc.) stay HTTP-agnostic; translate to `HttpError` at the controller boundary.

`createFastifyInstance()` registers the `setErrorHandler` that maps `HttpError → reply.status(err.statusCode).send({ error: err.expose ? err.message : "Internal error" })`. By default `expose=true` for 4xx and `false` for 5xx — so 5xx bodies do not leak internal `error.message`. Override `expose` when a 5xx message is intentionally public (e.g. `"render queue unavailable"`).

## Features & Routes

Plus `GET /health` — returns `{ status: "ok" }`, registered directly in `Server.start()` (used by k8s liveness probe).

### upload
| Method | Path | Description |
|--------|------|-------------|
| POST | `/upload/signed-url` | Generate presigned S3 PUT URL. Client uploads file directly to MinIO/S3 |

Controller: `src/features/upload/adapters/inbound/http/upload.controller.ts`

### render
| Method | Path | Description |
|--------|------|-------------|
| POST | `/render` | Validate, enqueue a `render.requested` command, return 202 `{ id }`. 503 if broker confirm cannot be obtained after retries. **No GET endpoint** — clients track lifecycle via AMQP events (`export.started`/`completed`/`failed`). |

Controller: `src/features/render/adapters/inbound/http/render.controller.ts`. Outbound command adapter: `src/features/render/adapters/outbound/amqp/RabbitMQRenderCommandAdapter.ts`.

The actual FFmpeg work runs in the **worker process** (see *Worker* below). Consumer: `src/features/render/adapters/inbound/amqp/RenderRequestedConsumer.ts`. DLQ consumer (terminal `export.failed` for dead-lettered jobs): `src/features/render/adapters/inbound/amqp/RenderDLQConsumer.ts`.

FFmpeg source processors (HLS, DASH, image, audio): `src/infrastructure/ffmpeg/source-processors/`.

### preview
| Method | Path | Description |
|--------|------|-------------|
| POST | `/editor/preview-source` | Generate preview from MPD/HLS source. Calls Core's `/private/channels/:id/play`, fetches the MPD from the returned URL with `vod-token`, builds an HLS playlist, stores it, returns the signed playlist URL |
| GET | `/editor/segment` | Proxy HLS segment — injects `vod-token` header into the upstream fetch (browsers cannot do it for HLS) |

Controller: `src/features/preview/adapters/inbound/http/preview.controller.ts`. Outbound adapter: `src/features/preview/adapters/outbound/http/HttpPreviewSourceAdapter.ts`. Same adapter is used against real Core/VOD and against `apps/core-mock`/`apps/mock-vod`. No demo branches.

## Worker

Separate Deployment (`deploy/worker/`), same image, entrypoint `src/worker.ts`. Bound to:

- `render.requested` (quorum queue, durable, `x-delivery-limit=5`, `x-overflow=reject-publish`, `x-max-length=10000`) — primary consumer.
- `render.dead` (DLX-bound queue) — DLQ consumer; publishes terminal `export.failed { error: "max retries exceeded" }`.

Per-message flow on `render.requested`:

1. Best-effort parse → Zod-validate envelope. Poison messages publish `export.failed { error: "invalid envelope" }` (when `jobId` is recoverable) and ack — they must not redeliver.
2. **Idempotency short-circuit**: `storage.exists(outputKey)`; if true, publish `export.completed` with the existing signed URL and ack. Skip FFmpeg.
3. Publish `export.started` (only when `saveMetadata` is present in the command).
4. Run `VideoRenderUseCase.execute(...)`.
5. Publish `export.completed`, ack.
6. On transient failure (use case throws): `nack(requeue=true)`. The broker increments `x-delivery-count`; once `x-delivery-limit` is hit, the message dead-letters to `render.dead`.

Output key derivation is deterministic from `jobId` (`<S3_OUTPUT_PREFIX>/<jobId>.<format>` or `<S3_OUTPUT_PREFIX>/<jobId>` for `dash`). The HEAD check in step 2 relies on this.

Shutdown: SIGTERM cancels consumers, waits up to 540s for in-flight to settle, drains the publisher, closes channels + connections, then stops the probe server. K8s `terminationGracePeriodSeconds: 600`.

## Infrastructure Adapters

| File | Purpose |
|------|---------|
| `src/infrastructure/storage/S3StorageAdapter.ts` | AWS SDK v3 S3 client (MinIO locally) |
| `src/infrastructure/messaging/RabbitMQPublisher.ts` | RabbitMQ AMQP publisher — events on `video-editor` (topic), commands on `video-editor.commands` (direct). Asserts both exchanges + the render queue/DLX on connect. |
| `src/infrastructure/messaging/RabbitMQConsumer.ts` | Generic AMQP consumer wrapper used by the worker. Each consumer instance opens its own connection/channel. |
| `src/infrastructure/messaging/schemas/commands.ts` | `render.requested` envelope schema + queue/exchange constants (server-internal, not exported via `@video-editor/contract`). |
| `src/infrastructure/ffmpeg/FfmpegVideoProcessor.ts` | FFmpeg video processing via raw `spawn` |
| `src/infrastructure/fastify/fastify.ts` | Typed Fastify instance factory |

## Shared Domain (`src/shared/`)

- `application/ports/outbound/StoragePort.ts` — storage interface (`exists()` used by the worker for idempotency)
- `utils/` — file, font, time utilities

HTTP route schemas + their value types (`OverlayType`, `TimeRange`, `VideoMetadata`, `DesignPayload`, `RenderRequest`, upload schemas, editor-export body types) live in `@video-editor/contract/internal/<feature>`. See [ADR 0004](../../docs/adr/0004-server-http-schemas-in-shared-contract-package.md).

## Environment Variables

All validated by Zod in `src/config/env.ts` — that file is the source of truth; keep this table in sync. The schema is split into three Zod objects: `commonEnvSchema` (loaded by both processes), `apiEnvSchema` (extends common, loaded by `parseApiEnv()`), and `workerEnvSchema` (extends common, loaded by `parseWorkerEnv()`). Unknown env keys are silently stripped — the worker pod can safely receive API-only env vars from a shared Secret.

### Common (both API and Worker)

**Observability**

| Var | Default | Description |
|-----|---------|-------------|
| `SERVICE_NAME` | `video-editor-server` | Logger/OTel service name |
| `SERVICE_VERSION` | `1.0.0` | Logger/OTel service version |
| `LOG_LEVEL` | `info` | Pino log level |
| `OTEL_ENDPOINT` | optional | OTel collector endpoint. OTel disabled when absent |

**FFmpeg / transcoding**

| Var | Default | Description |
|-----|---------|-------------|
| `FFMPEG_PRESET` | `veryfast` | FFmpeg encoding preset |
| `FFMPEG_CRF` | `20` | FFmpeg CRF quality |
| `FFMPEG_AUDIO_BITRATE` | `192k` | FFmpeg audio bitrate |
| `FFMPEG_MAX_CONCURRENT` | `2` | Max concurrent FFmpeg processes — drives the `FfmpegRunner` semaphore wired through DI |
| `MIN_TRANSCODE_SEGMENT_SECONDS` | `0.35` | Minimum segment length before transcoding |

**MPD / source transcoding**

| Var | Default | Description |
|-----|---------|-------------|
| `ENABLE_MPD_RESTRICTIONS` | `false` | Apply restrictions when MPD is multi-period/multi-AS |
| `TRANSCODE_TIMEOUT_MS` | `7200000` | MPD/HLS/audio transcode hard timeout (2h) |
| `MAX_TEMP_FILE_SIZE_MB` | `5000` | MPD transcode temp-file size cap |
| `MPD_TRANSCODE_CRF_MULTI` | `10` | CRF when MPD has multiple representations |
| `MPD_TRANSCODE_CRF_SINGLE` | `18` | CRF when MPD has a single representation |
| `MPD_TRANSCODE_PRESET` | `medium` | FFmpeg preset for MPD transcoding |

**S3 / MinIO (shared connection)**

| Var | Default | Description |
|-----|---------|-------------|
| `S3_BUCKET` | required | S3/MinIO bucket |
| `S3_ENDPOINT` | required | S3/MinIO endpoint |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_FORCE_PATH_STYLE` | `true` | Path-style addressing (required for MinIO) |
| `S3_ACCESS_KEY_ID` | required | S3 access key |
| `S3_SECRET_ACCESS_KEY` | required | S3 secret |
| `S3_OUTPUT_PREFIX` | `output` | Key prefix for processed output. **Worker writes; API derives idempotency keys.** Must match across both pods |
| `RENDER_URL_EXPIRY_SECONDS` | `86400` | TTL for signed render output URLs |

**Messaging**

| Var | Default | Description |
|-----|---------|-------------|
| `QUEUE_URL` | required | AMQP connection URL — neither API nor worker starts without this. `amqps://` triggers mTLS: process reads `/bundle.pem` (CA), `/tmp/certificates/rabbitmq/rabbit_cert.pem`, and `/tmp/certificates/rabbitmq/rabbit_key.pem` at boot. `amqp://` skips file reads (local dev) |
| `COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS` | `10000` | Per-attempt broker-confirm timeout for `publishCommand` (POST /render). 3 attempts; exhaustion → 503. Common because both processes share `buildPublisher()` |
| `EVENT_PUBLISH_CONFIRM_TIMEOUT_MS` | `30000` | Per-attempt broker-confirm timeout for `publishExport*` events. Larger than the command timeout because confirm round-trip during recovery may exceed 10s. On exhaustion: swallowed (caller never sees the error) |
| `AMQP_INITIAL_CONNECT_TIMEOUT_MS` | `15000` | Race timeout on initial broker connect. Required because `maxRetries: Infinity` would otherwise hang the process forever on unreachable brokers and prevent k8s from CrashLoopBackOff'ing the pod |
| `RENDER_REQUEST_TTL_MS` | optional | If set, `x-message-ttl` on the `render.requested` queue. **Common** because both API and worker assert topology — mismatch yields `PRECONDITION_FAILED` |

### API-only

| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `4001` | HTTP port |
| `HOST` | `127.0.0.1` | Bind host |
| `CORE_BASE_URL` | required | Core service base URL. **Includes the `/private` prefix** — real Core groups auth-required endpoints there, so the adapter appends `/channels/:id/play` to it. Dev: `http://localhost:8002/private` |
| `MOCK_VOD_BASE_URL` | optional | Boot-only — used to log the active mock-vod fixture window when `CORE_BASE_URL` is localhost. Defaults to `http://localhost:5050` if unset |
| `SERVER_BASE_URL` | required | Public server URL (used in signed segment URLs) |
| `SERVER_PUBLIC_PATH_PREFIX` | `""` | Ingress path prefix prepended to public-facing URLs the server emits (segment-proxy URLs in HLS playlists). Empty in local dev; set to e.g. `/api/video_editor/server` in environments fronted by a path-stripping reverse proxy |
| `PREVIEW_SIGNING_SECRET` | required | HMAC-SHA256 secret used to sign segment-proxy URLs. Min 32 chars. Without this, `/editor/segment` would be an SSRF vector |
| `MAX_PREVIEW_DURATION_MS` | `3600000` | Max preview window length (1h) |
| `PREVIEW_JOB_TTL_SECONDS` | `86400` | Preview-job retention TTL (24h) |
| `S3_PREVIEW_PREFIX` | `preview` | Key prefix for preview playlists/segments |
| `S3_UPLOAD_PREFIX` | `uploads` | Key prefix for direct-to-S3 uploads |
| `UPLOAD_MAX_SIZE_BYTES` | `524288000` | Max accepted upload size (500 MB). Enforced server-side AND bound into the presigned PUT via signed Content-Length |
| `S3_AUTO_CREATE_BUCKET` | `true` | Auto-create bucket on API startup |

### Worker-only

| Var | Default | Description |
|-----|---------|-------------|
| `WORKER_CONCURRENCY` | `1` | Worker AMQP prefetch + in-process render concurrency |
| `WORKER_PROBE_PORT` | `8081` | Worker probe + metrics port |

## Messaging (RabbitMQ)

Publisher: `RabbitMQPublisher` (hexagonal infra adapter). Asserts both the events topic exchange and the commands direct exchange + render queue topology on `connect()`. Schemas + envelope types from `@video-editor/contract/events`; command schema is server-internal in `src/infrastructure/messaging/schemas/commands.ts`.

| Aspect | Behavior |
|---|---|
| Events exchange | `video-editor` (topic, durable). Single exchange — any team binds queues against it. Routing keys: `export.started`, `export.completed`, `export.failed` |
| Commands exchange | `video-editor.commands` (direct, durable). Routing keys: `render.requested`. Server-internal — no external consumers |
| Render queue | `render.requested` (quorum, durable, `x-delivery-limit=5`, `x-overflow=reject-publish`, `x-max-length=10000`, optional `x-message-ttl`). DLX `video-editor.commands.dlx` → DLQ `render.dead` |
| Envelope | Every message body is `{ eventName, eventVersion, occurredAt, traceparent, data }`. AMQP headers `x-event-name`, `x-event-version` mirror the envelope so subscribers can filter without parsing JSON |
| Versioning | Additive change = same `eventVersion`. Breaking change = new version + parallel publish |
| Confirms | `confirmSelect` + `mandatory: true`. Broker-ack = success. Broker-nack or unrouted-return = failure |
| Retry (events) | 3 attempts, backoff 200ms / 1s. Per-attempt confirm-timeout via `EVENT_PUBLISH_CONFIRM_TIMEOUT_MS`. On exhaustion: `logAborting` via `ZMonitor` and **swallow** — controller never sees the error |
| Retry (commands) | Same 3 attempts + backoff, plus a per-attempt confirm-timeout race (`COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS`). On exhaustion: `logAborting` + **throw `PublishExhaustedError`** — controller maps to 503 |
| Monitoring | `ZMonitor` per publish: `processName: "amqp-publish"`, `stageName: <eventName|commandName>`, `businessId: <jobId>`. Consumer wraps each handle in `ZMonitor` (`processName: "amqp-consume"`) |
| Startup | Eager connect in `System.start()` / `Worker.start()`. Fail-fast: a plain-`connect()` probe asserts URL + topology (catches misconfig under recovery's infinite retry), then the recovering connect is raced against `AMQP_INITIAL_CONNECT_TIMEOUT_MS` so the process exits on an unreachable broker instead of hanging |
| Reconnect | Built-in via `amqplib` recovery wrapper (`connect(url, { recovery })`): `initialDelay: 1s`, `maxDelay: 30s`, `factor: 2`, `jitter: 0.2`, `maxRetries: Infinity`. Topology re-asserted in the `setup` callback on every reconnect (setup failure also routes through `_scheduleReconnect`, so backoff applies). `reconnect-scheduled` logs are rate-limited (attempt 1 + every 10th). Consumer self-recovers via the same wrapper — previously a broker blip stranded the worker until k8s restarted the pod |
| Heartbeats | Not configured — uses broker default. **amqplib v2 caveat**: `heartbeat: 0` *disables* heartbeats entirely (breaking change from v1). To use the broker's suggested value, omit the option (do NOT pass `0`) |
| handler-error | Subscribed on the recovery model AND each channel/confirm-channel. Surfaces synchronous throws from `close`/`error`/`return` handlers that pre-v1.0.7 amqplib swallowed silently — logged as `amqp_publisher_channel_handler_error` / `amqp_publisher_model_handler_error` |
| Channel-closed safety | `ChannelClosedError` rejects in-flight publish promises when the channel closes mid-publish (was a hang risk: events had no per-publish timeout). The publisher's `ch.on('close')` snapshots `inflight` before iterating so a settle handler that re-enters `publish()` can't invalidate the iteration |
| Shutdown (API) | HTTP close → `publisher.drain(5_000)` → `publisher.close()`. `close()` internally awaits `model.close()` which cancels the pending reconnect timer and rejects waiters. Unconfirmed messages at drain timeout logged as `amqp_publish_drained_unconfirmed` |
| Shutdown (worker) | Cancel consumers → wait for in-flight (≤540s) → `publisher.drain(5_000)` → `publisher.close()` → probe server stop. Consumer `close()` also closes its recovery model (disables future reconnect attempts) |
| OTel | Auto-instrumentation via `@opentelemetry/instrumentation-amqplib` (registered in `@ztube/observability`). No custom span attributes |

External teams subscribe to events by binding their own queue to the `video-editor` exchange and importing schemas from `@video-editor/contract/events`. See [packages/contract/src/events/README.md](../../packages/contract/src/events/README.md). The commands exchange is **not** part of the public contract.

## Tests

Vitest (`vitest.config.ts`). Test files co-located as `*.test.ts`.

```bash
pnpm test   # vitest run
```

## Key Dependencies

- `amqplib` v2 — AMQP client (used for both events and commands)
- `fastify` v5 — HTTP framework
- `@fastify/cors` — CORS plugin (registered in `bootstrap/server.ts`)
- `@ffmpeg-installer/ffmpeg` + `ffprobe-static` — bundled FFmpeg/ffprobe binaries; server invokes FFmpeg via raw `spawn`
- `@aws-sdk/*` — S3 interactions (MinIO in production)
- `fast-xml-parser` — MPD XML parsing (`src/features/preview/application/services/mpd-to-hls.service.ts`)
- `zod` — Env schema validation
- `sharp` — Image processing (SVG→PNG for overlays)
