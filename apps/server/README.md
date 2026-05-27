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
| `CHANNEL_PLAY_API_BASE_URL` | `""` | External preview API (empty = demo mode) |

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

## API Reference

All routes prefixed `/api`.

### Upload

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/upload/signed-url` | Generate presigned S3 upload URL |
| `POST` | `/api/uploads/file` | Multipart upload to S3 (500 MB limit) |
| `POST` | `/api/cleanup` | Remove S3 assets |

### Edit Video

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/edit-video` | Start FFmpeg processing job |
| `GET` | `/api/edit-video/progress/:jobId` | Poll job progress |

### Render

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/render` | Start Remotion render job |
| `GET` | `/api/render` | Read render job status |

### Preview

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/editor/preview-source` | Generate preview from MPD/HLS source |
| `GET` | `/api/editor/segment` | Proxy signed HLS segment |
| `GET` | `/api/editor/demo-assets/:filename` | Serve local demo media |

### Editor Export

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/editor/export` | Export editor state to video |

## Tests

Vitest. Test files co-located as `*.test.ts`.

```bash
pnpm test
```

## Key Dependencies

| Package | Purpose |
|---|---|
| `fastify` v5 | HTTP framework |
| `fluent-ffmpeg` | FFmpeg wrapper |
| `ioredis` / `redis` v5 | Redis client |
| `@aws-sdk/*` | S3 / MinIO client |
| `zod` | Env validation |
| `sharp` | Image processing |
| `@remotion/renderer` | Server-side video rendering |
