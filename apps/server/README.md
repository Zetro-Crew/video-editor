<div align="center">
  <img src="./assets/ztubeLogo.webp" alt="Video Editor" width="160" />

# `@video-editor/server`

Fastify + Node.js backend for the video editor. Handles uploads, FFmpeg rendering, and HLS preview proxying. Built for closed-network deployment — bundled FFmpeg, self-hosted S3 (MinIO) and RabbitMQ.

</div>

---

## Overview

Two entrypoints, one image:

| Entrypoint | Process | Port | Purpose |
|---|---|---|---|
| `src/index.ts` | **API** | `4001` (env `PORT`) | HTTP only — uploads, preview, enqueues render commands |
| `src/worker.ts` | **Worker** | `8081` (env `WORKER_PROBE_PORT`, probe + Prometheus metrics) | Consumes `render.requested`, runs FFmpeg, publishes `export.*` events |

The API never blocks on rendering. `POST /render` returns `202 { id }` after the broker confirms the command; clients track lifecycle through AMQP events (`export.started`, `export.completed`, `export.failed`) published on the `video-editor` topic exchange.

> [!NOTE]
> TypeScript is executed directly by Node.js 22.18+. No `tsx`, no `ts-node`, no build step in dev.

## Quick start

### Prerequisites

- Node.js `22.18+`
- pnpm
- Docker (for MinIO + RabbitMQ)

### Run locally

```bash
# From repo root — starts MinIO + RabbitMQ
docker compose up -d

# Install workspace deps
pnpm install

# Start the API in watch mode
cd apps/server
pnpm dev
```

The API binds to `http://127.0.0.1:4001`. To run the worker against the same `.env`:

```bash
node --env-file=.env src/worker.ts
```

### Commands

```bash
pnpm dev          # node --env-file=.env --watch-path=./src src/index.ts
pnpm start        # node src/index.ts (production API)
pnpm test         # vitest run
pnpm type-check   # tsc --noEmit
pnpm lint         # biome check . --write
```

## API

`GET /health` — `{ status: "ok" }`. Used by k8s liveness probe. Registered directly in `Server.start()`.

### Upload

| Method | Path | Description |
|---|---|---|
| `POST` | `/upload/signed-url` | Returns a presigned S3 PUT URL. Client uploads the file directly to MinIO/S3. `Content-Length` is bound into the signed URL so S3 rejects mismatched uploads. |

### Render

| Method | Path | Description |
|---|---|---|
| `POST` | `/render` | Validates the design payload, publishes a `render.requested` command, returns `202 { id }`. Returns `503` if the broker cannot confirm after retries. |

> [!IMPORTANT]
> There is **no `GET /render`** endpoint. Clients receive lifecycle updates by binding a queue to the `video-editor` exchange and consuming `export.started` / `export.completed` / `export.failed`.

### Preview

| Method | Path | Description |
|---|---|---|
| `POST` | `/editor/preview-source` | Generates an HLS preview from a Core `channel-range`. Calls Core's `/private/channels/:id/play`, fetches the MPD using `vod-token`, builds a playlist, returns a signed playlist URL. |
| `GET` | `/editor/segment` | Proxies a single HLS segment. Verifies the HMAC signature, then re-fetches the upstream segment with the `vod-token` header injected (browsers can't set headers on HLS requests). |

## Architecture

Hexagonal (Ports & Adapters). Every feature is self-contained:

```
src/
├── bootstrap/          # System, Worker, Server, DI container, shutdown
├── config/             # Zod-validated env schema (source of truth)
├── infrastructure/     # Shared adapters: Fastify, FFmpeg, S3, AMQP
├── shared/             # Cross-feature domain types + ports
└── features/
    ├── upload/
    ├── render/
    └── preview/
        ├── adapters/
        │   ├── inbound/http/   # Fastify controllers
        │   ├── inbound/amqp/   # AMQP consumers (render only)
        │   └── outbound/       # FFmpeg, S3, HTTP, AMQP
        ├── application/
        │   ├── use-cases/
        │   ├── ports/outbound/
        │   └── services/
        └── domain/
```

`src/bootstrap/container.ts` exposes `buildApiContainer` and `buildWorkerContainer`. The API gets the HTTP controllers + a `RenderCommandPort`; the worker gets the FFmpeg use case + the `render.requested` and `render.dead` consumers.

See [`CLAUDE.md`](./CLAUDE.md) for the deep-dive map of files, consumers, and shutdown semantics.

## Worker

Same image, entrypoint `src/worker.ts`. Bound to two queues:

| Queue | Type | Behavior |
|---|---|---|
| `render.requested` | quorum, durable, `x-delivery-limit=5`, `x-overflow=reject-publish`, `x-max-length=10000` | Primary consumer — runs FFmpeg, publishes `export.completed` |
| `render.dead` | DLX-bound | Publishes terminal `export.failed { error: "max retries exceeded" }` for jobs that exceed the delivery limit |

Per-message flow on `render.requested`:

1. Parse → Zod-validate the envelope. Poison messages publish `export.failed { error: "invalid envelope" }` (if `jobId` is recoverable) and ack — they must not redeliver.
2. **Idempotency short-circuit:** `storage.exists(outputKey)`. If true, publish `export.completed` with the existing signed URL and ack. Skip FFmpeg.
3. Publish `export.started` (only when `saveMetadata` is present on the command).
4. Run `VideoRenderUseCase.execute(...)`.
5. Publish `export.completed`, ack.
6. On transient failure: `nack(requeue=true)`. The broker dead-letters to `render.dead` once `x-delivery-count` exceeds `x-delivery-limit`.

Output keys are deterministic from `jobId` (`<S3_OUTPUT_PREFIX>/<jobId>.<format>`, or `<S3_OUTPUT_PREFIX>/<jobId>` for `dash`). The HEAD check in step 2 relies on this.

Worker shutdown cancels consumers, waits up to 540s for in-flight work, drains the publisher (5s), closes channels + connections, then stops the probe server. K8s `terminationGracePeriodSeconds: 600`.

## Messaging (RabbitMQ)

Two durable exchanges, asserted on `connect()`:

| Aspect | Value |
|---|---|
| Events exchange | `video-editor` (topic, durable). Routing keys: `export.started`, `export.completed`, `export.failed` |
| Commands exchange | `video-editor.commands` (direct, durable). Routing keys: `render.requested`. **Server-internal — not part of the public contract.** |
| Envelope | `{ eventName, eventVersion, occurredAt, traceparent, data }`. AMQP headers `x-event-name` and `x-event-version` mirror the envelope so subscribers can filter without parsing JSON |
| Confirms | `confirmSelect` + `mandatory: true`. Broker-ack = success; broker-nack or unrouted-return = failure |
| Retry (events) | 3 attempts, backoff `100ms / 500ms / 2s`. On exhaustion: log + **swallow** — controller never sees the error |
| Retry (commands) | Same backoff plus a per-attempt confirm-timeout race (`COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS`). On exhaustion: throws `PublishExhaustedError` → controller maps to `503` |
| Reconnect | Background loop on close/error. Backoff `1s/2s/5s/10s`, capped at 30s. Stops on explicit `close()` |
| Startup | Eager connect in `System.start()` / `Worker.start()`. Fail-fast if broker unreachable |

External teams subscribe to events by binding their own queue to the `video-editor` exchange and importing schemas from `@video-editor/contract/events`. See [`packages/contract/src/events/README.md`](../../packages/contract/src/events/README.md) for envelope details, binding examples, and versioning policy.

## Environment

All variables are validated by Zod in [`src/config/env.ts`](./src/config/env.ts) — that file is the source of truth. The schema is split into three Zod objects: `commonEnvSchema` (loaded by both processes), `apiEnvSchema` (extends common, loaded by `parseApiEnv()`), and `workerEnvSchema` (extends common, loaded by `parseWorkerEnv()`). Unknown env keys are silently stripped.

## Common (both API and Worker)

### Observability

| Variable | Default | Description |
|---|---|---|
| `SERVICE_NAME` | `video-editor-server` | Logger / OTel service name |
| `SERVICE_VERSION` | `1.0.0` | Logger / OTel service version |
| `LOG_LEVEL` | `info` | Pino log level |
| `OTEL_ENDPOINT` | optional | OTel collector endpoint. OTel is disabled when absent |

### FFmpeg / transcoding

| Variable | Default | Description |
|---|---|---|
| `FFMPEG_PRESET` | `veryfast` | Encoder preset |
| `FFMPEG_CRF` | `20` | Quality (lower = better) |
| `FFMPEG_AUDIO_BITRATE` | `192k` | Audio bitrate |
| `FFMPEG_MAX_CONCURRENT` | `2` | Max concurrent FFmpeg processes — drives the `FfmpegRunner` semaphore wired through DI |
| `MIN_TRANSCODE_SEGMENT_SECONDS` | `0.35` | Minimum segment length before transcoding |

### MPD / source transcoding

| Variable | Default | Description |
|---|---|---|
| `ENABLE_MPD_RESTRICTIONS` | `false` | Apply restrictions when MPD is multi-period/multi-AS |
| `TRANSCODE_TIMEOUT_MS` | `7200000` | MPD/HLS/audio transcode hard timeout (2h) |
| `MAX_TEMP_FILE_SIZE_MB` | `5000` | MPD transcode temp-file size cap |
| `MPD_TRANSCODE_CRF_MULTI` | `10` | CRF when MPD has multiple representations |
| `MPD_TRANSCODE_CRF_SINGLE` | `18` | CRF when MPD has a single representation |
| `MPD_TRANSCODE_PRESET` | `medium` | FFmpeg preset for MPD transcoding |

### S3 / MinIO (shared connection)

| Variable | Default | Description |
|---|---|---|
| `S3_BUCKET` | required | Bucket name |
| `S3_ENDPOINT` | required | Endpoint URL |
| `S3_REGION` | `us-east-1` | Region |
| `S3_FORCE_PATH_STYLE` | `true` | Path-style addressing (required for MinIO) |
| `S3_ACCESS_KEY_ID` | required | Access key |
| `S3_SECRET_ACCESS_KEY` | required | Secret |
| `S3_OUTPUT_PREFIX` | `output` | Key prefix for render output. **Worker writes; API derives idempotency keys.** Must match across both pods |
| `RENDER_URL_EXPIRY_SECONDS` | `86400` | TTL for signed render output URLs |

### Messaging

| Variable | Default | Description |
|---|---|---|
| `RABBITMQ_URL` | required | AMQP connection URL — neither API nor worker starts without it |
| `COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS` | `10000` | Per-attempt broker-confirm timeout for `publishCommand` (3 retries; exhaustion → 503). Common because both processes share `buildPublisher()` |
| `EVENT_PUBLISH_CONFIRM_TIMEOUT_MS` | `30000` | Per-attempt broker-confirm timeout for event publishes |
| `AMQP_INITIAL_CONNECT_TIMEOUT_MS` | `15000` | Initial AMQP connect timeout |
| `RENDER_REQUEST_TTL_MS` | optional | If set, `x-message-ttl` on the `render.requested` queue. Common because both processes assert topology |

## API-only

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4001` | HTTP port |
| `HOST` | `127.0.0.1` | Bind host |
| `CORE_BASE_URL` | required | Upstream Core base URL. **Includes the `/private` prefix.** Dev: `http://localhost:8002/private` |
| `MOCK_VOD_BASE_URL` | optional | Boot-only — logs the active mock-vod fixture window when `CORE_BASE_URL` is localhost. Defaults to `http://localhost:5050` |
| `SERVER_BASE_URL` | required | Public server URL — used in signed segment URLs |
| `PREVIEW_SIGNING_SECRET` | required | HMAC-SHA256 secret for `/editor/segment` URL signing. Min 32 chars. Without this, the segment proxy would be an SSRF vector |
| `MAX_PREVIEW_DURATION_MS` | `3600000` | Max preview window length (1h) |
| `PREVIEW_JOB_TTL_SECONDS` | `86400` | Preview-job retention TTL |
| `S3_PREVIEW_PREFIX` | `preview` | Key prefix for preview playlists/segments |
| `S3_UPLOAD_PREFIX` | `uploads` | Key prefix for uploaded assets |
| `UPLOAD_MAX_SIZE_BYTES` | `524288000` | Max accepted upload size (500 MB). Enforced server-side and bound into the presigned PUT |
| `S3_AUTO_CREATE_BUCKET` | `true` | Auto-create bucket on API startup if missing |

## Worker-only

| Variable | Default | Description |
|---|---|---|
| `WORKER_CONCURRENCY` | `1` | AMQP prefetch + in-process render concurrency |
| `WORKER_PROBE_PORT` | `8081` | Probe + metrics port |

## Tests

Vitest. Test files are co-located as `*.test.ts`.

```bash
pnpm test
```

The render AMQP tests use [`@testcontainers/rabbitmq`](https://github.com/testcontainers/testcontainers-node) — Docker must be running.

## Deployment

Single `Dockerfile` builds both entrypoints. The image is published once; the API and worker are separate Deployments that differ only in `CMD`. Worker manifests live in [`../../deploy/worker/`](../../deploy/worker/) — see [`docs/adr/0005-render-worker-deployment.md`](../../docs/adr/0005-render-worker-deployment.md).

> [!WARNING]
> This server is designed for **closed-network deployment**. FFmpeg is bundled via `@ffmpeg-installer/ffmpeg`; S3 is satisfied by self-hosted MinIO; RabbitMQ is self-hosted. Do not add dependencies that fetch from public URLs at runtime.

## Key dependencies

| Package | Purpose |
|---|---|
| `fastify` v5 | HTTP framework |
| `amqplib` v2 | AMQP client (events + commands) |
| `@aws-sdk/*` | S3 / MinIO client |
| `@ffmpeg-installer/ffmpeg` + `ffprobe-static` | Bundled FFmpeg/ffprobe binaries; invoked via raw `spawn` |
| `sharp` | Image processing (SVG → PNG for overlays) |
| `zod` + `fastify-type-provider-zod` | Env + request schema validation |
| `@video-editor/contract` | Shared HTTP request schemas + AMQP envelope contracts |
| `@ztube/observability` | Pino logger, OTel auto-instrumentation, Pyroscope |
