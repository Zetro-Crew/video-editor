# Server App

> **Closed network deployment:** This server runs in air-gapped environments. All FFmpeg binaries, S3 (MinIO), and Redis must be self-hosted. Do not introduce dependencies that phone home or fetch from public URLs at runtime.
>
> **Keep this file updated:** Update whenever features, dependencies, or architecture change.

Fastify + Node.js 22.18+ API server. Port **4000** (env `PORT`, default `4001` in config). TypeScript executed directly — no tsx/ts-node.

## Commands

```bash
pnpm dev          # node --env-file=.env --watch-path=./src src/index.ts
pnpm start        # node src/index.ts (production)
pnpm test         # vitest run
pnpm type-check   # tsc --noEmit
pnpm lint         # biome check .
pnpm lint:fix     # biome check . --write --unsafe
pnpm format       # biome format . --write
```

## Entry & Bootstrap

- `src/index.ts` — parses env, builds container, starts server
- `src/bootstrap/container.ts` — DI container: instantiates all adapters and use cases
- `src/bootstrap/server.ts` — `Server` class: registers Fastify plugins + controllers, binds port
- `src/config/env.ts` — Zod-validated env schema with defaults

## Architecture: Hexagonal (Ports & Adapters)

```
src/
├── bootstrap/          # DI container + server wiring
├── config/             # Env validation
├── infrastructure/     # Framework adapters (Fastify, FFmpeg, S3)
├── shared/             # Cross-feature domain types + ports
└── features/           # Business features (see below)
    └── <feature>/
        ├── adapters/
        │   ├── inbound/http/   # HTTP controllers (Fastify plugins)
        │   └── outbound/       # Redis, FFmpeg, S3, HTTP adapters
        ├── application/
        │   ├── use-cases/      # Orchestration
        │   ├── ports/outbound/ # Interfaces
        │   └── services/       # Domain services (where needed)
        └── domain/             # Domain logic/policies
```

## Features & Routes

### upload
| Method | Path | Description |
|--------|------|-------------|
| POST | `/upload/signed-url` | Generate presigned S3 upload URL |
| POST | `/uploads/file` | Multipart file upload to S3 (500 MB limit) |
| POST | `/cleanup` | Remove uploaded S3 assets |

Controller: `src/features/upload/adapters/inbound/http/upload.controller.ts`

### edit-video
| Method | Path | Description |
|--------|------|-------------|
| POST | `/edit-video` | Start FFmpeg edit-video processing job |
| GET | `/edit-video/progress/:jobId` | Poll job progress from Redis |

Controller: `src/features/edit-video/adapters/inbound/http/edit-video.controller.ts`

Source processors (HLS, DASH, image, audio, `internal://blank`):
`src/features/edit-video/adapters/outbound/ffmpeg/source-processors/`

### render
| Method | Path | Description |
|--------|------|-------------|
| POST | `/render` | Start render job; returns `{ id }`. If `saveMetadata` present, publishes `export.started` to RabbitMQ |
| GET | `/render` | Poll render job status |
| DELETE | `/render` | Cancel render job — kills FFmpeg via AbortSignal, marks Redis state CANCELLED |

Controller: `src/features/render/adapters/inbound/http/render.controller.ts`

### preview
| Method | Path | Description |
|--------|------|-------------|
| POST | `/editor/preview-source` | Generate preview from MPD/HLS source. Calls Core's `/private/channels/:id/play`, fetches the MPD from the returned URL with `vod-token`, builds an HLS playlist, stores it, returns the signed playlist URL |
| GET | `/editor/segment` | Proxy HLS segment — injects `vod-token` header into the upstream fetch (browsers cannot do it for HLS) |

Controller: `src/features/preview/adapters/inbound/http/preview.controller.ts`

Outbound adapter: `src/features/preview/adapters/outbound/http/HttpPreviewSourceAdapter.ts` (implements `PreviewSourcePort` with `play()` + `fetchManifest()`). Same adapter is used against real Core/VOD and against `apps/core-mock`/`apps/mock-vod`. No demo branches.

### editor-export
| Method | Path | Description |
|--------|------|-------------|
| POST | `/editor/export` | Export editor state to video via render pipeline |

Controller: `src/features/editor-export/adapters/inbound/http/editor-export.controller.ts`

## Infrastructure Adapters

| File | Purpose |
|------|---------|
| `src/infrastructure/storage/S3StorageAdapter.ts` | AWS SDK v3 S3 client (MinIO locally) |
| `src/infrastructure/messaging/RabbitMQPublisher.ts` | RabbitMQ AMQP publisher — exchange `video-editor` (topic), routing keys: `export.started`, `export.completed`, `export.failed`. See *Messaging* below |
| `src/infrastructure/ffmpeg/FfmpegVideoProcessor.ts` | FFmpeg video processing via raw `spawn` |
| `src/features/render/adapters/outbound/redis/RedisRenderJobStateAdapter.ts` | Render job state in Redis |
| `src/features/edit-video/adapters/outbound/redis/RedisEditVideoJobStateAdapter.ts` | Edit-video job progress in Redis |
| `src/infrastructure/fastify/fastify.ts` | Typed Fastify instance factory |

## Shared Domain (`src/shared/`)

- `domain/OverlayType.ts`, `TimeRange.ts`, `VideoMetadata.ts`, `RenderResponse.ts`
- `application/ports/outbound/StoragePort.ts` — storage interface
- `utils/` — file, font, time utilities

## Environment Variables

All validated by Zod in `src/config/env.ts`. Key vars:

| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `4001` | HTTP port |
| `HOST` | `127.0.0.1` | Bind host |
| `S3_BUCKET` | `video-editor` | S3/MinIO bucket |
| `S3_ENDPOINT` | `http://localhost:9000` | S3/MinIO endpoint |
| `S3_UPLOAD_PREFIX` | `uploads` | Key prefix for uploads |
| `S3_OUTPUT_PREFIX` | `output` | Key prefix for processed output |
| `S3_AUTO_CREATE_BUCKET` | `true` | Auto-create bucket on startup |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `RENDER_URL_EXPIRY_SECONDS` | `86400` | TTL for signed render output URLs |
| `JOB_PROGRESS_TTL_SECONDS` | `600` | TTL for job progress keys in Redis |
| `FFMPEG_PRESET` | `veryfast` | FFmpeg encoding preset |
| `FFMPEG_CRF` | `20` | FFmpeg CRF quality |
| `CORE_BASE_URL` | required | Core service base URL. **Includes the `/private` prefix** — real Core groups auth-required endpoints there, so the adapter appends `/channels/:id/play` to it. Dev: `http://localhost:8002/private` |
| `MOCK_VOD_BASE_URL` | optional | Boot-only — used to log the active mock-vod fixture window when `CORE_BASE_URL` is localhost. Defaults to `http://localhost:5050` if unset |
| `PREVIEW_SIGNING_SECRET` | required | HMAC-SHA256 secret used to sign segment-proxy URLs. Min 32 chars. Without this, `/editor/segment` would be an SSRF vector |
| `SERVER_BASE_URL` | `http://localhost:4001` | Public server URL (used in signed segment URLs) |
| `RABBITMQ_URL` | required | AMQP connection URL — service won't start without this |

## Messaging (RabbitMQ)

Publisher: `RabbitMQPublisher` (hexagonal infra adapter). Schemas + envelope types from `@video-editor/contract/events`.

| Aspect | Behavior |
|---|---|
| Exchange | `video-editor` (topic, durable). Single exchange — any team binds queues against it |
| Routing keys | `export.started`, `export.completed`, `export.failed` (lowercase `<domain>.<action>`) |
| Envelope | Every message body is `{ eventName, eventVersion, occurredAt, traceparent, data }`. AMQP headers `x-event-name`, `x-event-version` mirror the envelope so subscribers can filter without parsing JSON |
| Versioning | Additive change = same `eventVersion`. Breaking change = new version + parallel publish |
| Confirms | `confirmSelect` + `mandatory: true`. Broker-ack = success. Broker-nack or unrouted-return = failure |
| Retry | 3 attempts per publish, backoff 100ms / 500ms / 2s. On exhaustion: `logAborting` via `ZMonitor` and **swallow** — controller never sees the error |
| Monitoring | `ZMonitor` per publish: `processName: "amqp-publish"`, `stageName: <eventName>`, `businessId: <jobId>`. Lifecycle: `logStarted` → `logRetry` (per retry) → `logSuccess` OR `logAborting` |
| Startup | Eager connect in `System.start()` (after Redis). Fail-fast: throws if broker unreachable |
| Reconnect | Background loop on connection close/error. Backoff 1s/2s/5s/10s capped at 30s. Each attempt logged via `ZMonitor` (`stageName: "reconnect"`, `businessId: "connection"`). Stops on explicit `close()` |
| Shutdown | `System.stop()` order: HTTP close → `publisher.drain(5_000)` → `publisher.close()` → `redis.quit()`. Unconfirmed messages at drain timeout logged as `amqp_publish_drained_unconfirmed` |
| Signals | `SIGTERM`/`SIGINT` registered in `src/index.ts`. Idempotent. Hard-exit fallback at 15s |
| OTel | Auto-instrumentation via `@opentelemetry/instrumentation-amqplib` (registered in `@ztube/observability`). No custom span attributes |

External teams subscribe by binding their own queue to the `video-editor` exchange and importing schemas from `@video-editor/contract/events`. See [packages/contract/src/events/README.md](../../packages/contract/src/events/README.md).

## Tests

Vitest (`vitest.config.ts`). Test files co-located as `*.test.ts`.

```bash
pnpm test   # vitest run
```

## Key Dependencies

- `amqplib` v2 — AMQP client for RabbitMQ event publishing
- `fastify` v5 — HTTP framework
- `@ffmpeg-installer/ffmpeg` + `ffprobe-static` — bundled FFmpeg/ffprobe binaries; server invokes FFmpeg via raw `spawn`
- `redis` v5 — Redis client (node-redis)
- `@aws-sdk/*` — S3 interactions (MinIO in production)
- `zod` — Env schema validation
- `sharp` — Image processing (SVG→PNG for overlays)
