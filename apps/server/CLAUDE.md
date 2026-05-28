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
| POST | `/editor/preview-source` | Generate preview from MPD/HLS source |
| GET | `/editor/segment` | Proxy HLS segment (signed URL) |
| GET | `/editor/demo-assets/:filename` | Serve local demo media files |

Controller: `src/features/preview/adapters/inbound/http/preview.controller.ts`

### editor-export
| Method | Path | Description |
|--------|------|-------------|
| POST | `/editor/export` | Export editor state to video via render pipeline |

Controller: `src/features/editor-export/adapters/inbound/http/editor-export.controller.ts`

## Infrastructure Adapters

| File | Purpose |
|------|---------|
| `src/infrastructure/storage/S3StorageAdapter.ts` | AWS SDK v3 S3 client (MinIO locally) |
| `src/infrastructure/messaging/RabbitMQPublisher.ts` | RabbitMQ AMQP publisher — exchange `video-editor` (topic), routing keys: `export.started`, `export.completed`, `export.failed` |
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
| `CHANNEL_PLAY_API_BASE_URL` | `""` | External preview source API (leave empty for demo mode) |
| `SERVER_BASE_URL` | `http://localhost:4001` | Public server URL (used in signed segment URLs) |
| `RABBITMQ_URL` | required | AMQP connection URL — service won't start without this |

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
