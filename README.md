# React Video Editor

<p align="left">
  <img src="apps/frontend/public/icon.svg" alt="React Video Editor" width="48" height="48">
</p>

A full-stack, browser-based video editor built on [Remotion](https://www.remotion.dev/) and React 19. Compose scenes on a drag-and-drop timeline, apply transitions and overlays, then export to video — all from the browser.

> **Deployment target:** Closed, air-gapped network environments. All infrastructure (MinIO, RabbitMQ, FFmpeg) is self-hosted. No public internet access is required or expected at runtime.

## Documentation

The `wiki/` folder mirrors the GitLab project wiki for closed-network deployments. It is hand-maintained in Hebrew; copy its contents into your `<project>.wiki.git` repo after each refresh.

## Architecture

| App / Package | Description | Port |
|---|---|---|
| `apps/frontend` | Vite + React 19 SPA — the editor UI | 3000 |
| `apps/server` | Fastify + Node.js. **API** (port 4001) handles uploads + enqueues render jobs; **Worker** (probe port 8081) consumes the queue + runs FFmpeg | 4001 / 8081 |
| `apps/iframe-demo` | Angular 21 harness for iframe integration testing | 8080 |
| `apps/core-mock` | Dev-only Fastify mock of the upstream Core service | 8002 |
| `apps/mock-vod` | Dev-only Fastify mock of the upstream VOD service | 5050 |
| `packages/contract` | `@video-editor/contract` — Zod schemas/types. Subpaths: `/iframe/from-parent`, `/iframe/to-parent`, `/events`, `/internal/*` | — |
| `packages/observability` | `@ztube/observability` — OpenTelemetry tracing, metrics, structured logging | — |

## Prerequisites

- Node.js 22.18+
- pnpm 10+
- Docker (for MinIO + RabbitMQ)
- FFmpeg (installed automatically via `@ffmpeg-installer/ffmpeg`)

## Getting Started

**1. Install dependencies**

```bash
pnpm install
```

**2. Start infrastructure**

```bash
docker compose up -d
```

This starts MinIO (S3-compatible storage, port 9000/9001) and RabbitMQ (port 5672, management UI 15672).

**3. Configure the server**

Copy and edit the server environment:

```bash
cp apps/server/.env.example apps/server/.env
```

Key variables (all have defaults for local dev):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4001` | API server port |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO endpoint |
| `S3_ACCESS_KEY_ID` | `minioadmin` | MinIO access key |
| `S3_SECRET_ACCESS_KEY` | `minioadmin123` | MinIO secret |
| `CORE_BASE_URL` | required | Upstream Core service base URL (includes `/private`). Dev: `http://localhost:8002/private` |
| `PREVIEW_SIGNING_SECRET` | required | HMAC-SHA256 secret (min 32 chars) for signed segment-proxy URLs |
| `QUEUE_URL` | required | AMQP connection URL for export event publishing. `amqps://` triggers mTLS (reads `/bundle.pem` + `/tmp/certificates/rabbitmq/rabbit_{cert,key}.pem` at boot) |

See [apps/server/README.md](apps/server/README.md) for the full env schema.

**4. Run everything**

```bash
pnpm dev
```

This runs frontend, server, and iframe-demo in parallel via Turborepo.

## Workspace Commands

```bash
pnpm dev          # Run all apps in parallel
pnpm build        # Build all apps
pnpm lint         # Lint all apps (Biome)
pnpm format       # Format all apps (Biome)
pnpm test         # Run all test suites
```

Per-app commands are documented in each app's README.

## Key Features

- **Timeline editor** — drag, trim, and reorder video/audio/image tracks
- **Remotion Player** — frame-accurate preview in the browser
- **FFmpeg processing** — server-side HLS/DASH ingest, overlay composition
- **S3 storage** — upload assets to MinIO (local) or any S3-compatible store
- **Export pipeline** — FFmpeg (via raw `spawn`) renders and processes video on the server
- **iframe embedding** — embed the editor in any page via postMessage API
- **RabbitMQ events** — server publishes `export.started`, `export.completed`, `export.failed` to the `video-editor` topic exchange

## iframe Integration

The editor can be embedded at `/editor/embed` and controlled via `postMessage`. The `@video-editor/contract` package provides typed Zod schemas across four subpaths:

- `@video-editor/contract/iframe/from-parent` — parent → editor messages
- `@video-editor/contract/iframe/to-parent` — editor → parent messages
- `@video-editor/contract/events` — RabbitMQ event envelopes (external consumers)
- `@video-editor/contract/internal/<feature>` — server-owner HTTP schemas (not for external use)

See [packages/contract/README.md](packages/contract/README.md) and [apps/iframe-demo/README.md](apps/iframe-demo/README.md) for details.

## Tech Stack

**Frontend:** React 19, Vite, Remotion, Zustand, TanStack Query, Tailwind v4, shadcn/ui, `@designcombo/*`

**Server:** Fastify 5, Node.js 22, FFmpeg (bundled via `@ffmpeg-installer/ffmpeg`), AWS SDK v3 (S3/MinIO), `amqplib`, Zod, Sharp

**Observability:** OpenTelemetry tracing + metrics, Pyroscope profiling, Pino logging (via `@ztube/observability`)

**Tooling:** pnpm, Turborepo, Biome, TypeScript, Vitest, Playwright
