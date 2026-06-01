# Server — `server`

Fastify + Node.js 22.18+ API server. Handles media uploads, FFmpeg processing, Remotion rendering, and preview proxying. Runs on port **4001** (default).

TypeScript is executed directly via Node.js — no `tsx` or `ts-node`.

## Commands

```bash
pnpm dev          # Node watch mode (requires .env)
pnpm start        # Production start
pnpm test         # Vitest
pnpm type-check   # tsc --noEmit
pnpm lint         # Biome check
pnpm lint:fix     # Biome check --write --unsafe
pnpm format       # Biome format
```

## Setup

Copy `.env.example` and configure:

```bash
cp .env.example .env
```

MinIO and Redis must be running before starting:

```bash
docker compose up -d   # from repo root
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4001` | HTTP bind port |
| `HOST` | `127.0.0.1` | HTTP bind host |
| `S3_BUCKET` | `video-editor` | S3/MinIO bucket name |
| `S3_ENDPOINT` | `http://localhost:9000` | S3/MinIO endpoint |
| `S3_ACCESS_KEY_ID` | `minioadmin` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | `minioadmin123` | S3 secret key |
| `S3_UPLOAD_PREFIX` | `uploads` | Key prefix for uploaded assets |
| `S3_OUTPUT_PREFIX` | `output` | Key prefix for processed output |
| `S3_AUTO_CREATE_BUCKET` | `true` | Create bucket on startup if missing |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `RENDER_URL_EXPIRY_SECONDS` | `86400` | TTL for signed render URLs |
| `JOB_PROGRESS_TTL_SECONDS` | `600` | TTL for job progress in Redis |
| `FFMPEG_PRESET` | `veryfast` | FFmpeg encoding preset |
| `FFMPEG_CRF` | `20` | FFmpeg quality (lower = better) |
| `SERVER_BASE_URL` | `http://localhost:4001` | Public server URL (used in signed URLs) |
| `CORE_BASE_URL` | required | Upstream Core service base URL. **Includes the `/private` prefix.** Dev: `http://localhost:8002/private` |
| `MOCK_VOD_BASE_URL` | `http://localhost:5050` | Boot-only — logs the active mock-vod fixture window when `CORE_BASE_URL` is localhost |
| `PREVIEW_SIGNING_SECRET` | required | HMAC-SHA256 secret (min 32 chars) used to sign segment-proxy URLs. Without this, `/editor/segment` would be an SSRF vector |
| `RABBITMQ_URL` | required | AMQP connection URL for export event publishing |

## Architecture

Hexagonal (Ports & Adapters). Each feature is self-contained:

```
src/
├── bootstrap/          # DI container + server wiring
├── config/             # Zod-validated env schema
├── infrastructure/     # Shared adapters (Fastify, S3)
├── shared/             # Cross-feature domain types + ports
└── features/
    └── <feature>/
        ├── adapters/
        │   ├── inbound/http/   # Fastify controllers
        │   └── outbound/       # Redis, FFmpeg, S3, HTTP
        ├── application/
        │   ├── use-cases/      # Orchestration
        │   └── ports/outbound/ # Port interfaces
        └── domain/             # Domain logic
```

## Messaging (RabbitMQ)

Server publishes render-job lifecycle events to a single topic exchange:

| Aspect | Value |
|---|---|
| Exchange | `video-editor` (topic, durable) |
| Routing keys | `export.started`, `export.completed`, `export.failed` |
| Envelope | `{ eventName, eventVersion, occurredAt, traceparent?, data }` — mirrored into AMQP headers `x-event-name`, `x-event-version` |
| Guarantees | Publisher confirms + `mandatory: true`. Retry 3× with backoff. Failures logged and swallowed (controller never sees them) |
| Startup | Eager connect after Redis. Fail-fast if broker unreachable |

External consumers bind their own queue against `video-editor` and import schemas from `@video-editor/contract/events`. See [packages/contract/src/events/README.md](../../packages/contract/src/events/README.md) for envelope details, binding examples, and versioning policy.

## API Reference

### Upload

| Method | Path | Description |
|---|---|---|
| `POST` | `/upload/signed-url` | Generate presigned S3 upload URL |
| `POST` | `/uploads/file` | Multipart upload to S3 (500 MB limit) |
| `POST` | `/cleanup` | Remove S3 assets |

### Edit Video

| Method | Path | Description |
|---|---|---|
| `POST` | `/edit-video` | Start FFmpeg processing job |
| `GET` | `/edit-video/progress/:jobId` | Poll job progress |

### Render

| Method | Path | Description |
|---|---|---|
| `POST` | `/render` | Start render job; publishes `export.started` when `saveMetadata` is present |
| `GET` | `/render` | Read render job status |
| `DELETE` | `/render` | Cancel render job — kills FFmpeg via AbortSignal, marks Redis state CANCELLED |

### Preview

| Method | Path | Description |
|---|---|---|
| `POST` | `/editor/preview-source` | Generate preview from MPD/HLS source |
| `GET` | `/editor/segment` | Proxy signed HLS segment (injects `vod-token` upstream) |
| `GET` | `/editor/demo-assets/:filename` | Serve local demo media |

### Editor Export

| Method | Path | Description |
|---|---|---|
| `POST` | `/editor/export` | Export editor state to video |

## Tests

Vitest. Test files co-located as `*.test.ts`.

```bash
pnpm test
```

## Key Dependencies

| Package | Purpose |
|---|---|
| `fastify` v5 | HTTP framework |
| `amqplib` v2 | AMQP client for RabbitMQ event publishing |
| `redis` v5 | Redis client (node-redis) |
| `@aws-sdk/*` | S3 / MinIO client |
| `zod` | Env validation |
| `sharp` | Image processing |
| `@ffmpeg-installer/ffmpeg` | Bundled FFmpeg binary; invoked via raw `spawn` |
