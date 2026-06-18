# React Video Editor

<p align="left">
  <img src="apps/frontend/public/icon.svg" alt="React Video Editor" width="48" height="48">
</p>

A full-stack, browser-based video editor built on [Remotion](https://www.remotion.dev/) and React 19. Compose scenes on a drag-and-drop timeline, apply transitions and overlays, then export to video — all from the browser.

> [!NOTE]
> **Deployment target:** Closed, air-gapped network environments. All infrastructure (MinIO, RabbitMQ, FFmpeg) is self-hosted. No public internet access is required or expected at runtime.

## Documentation

The `wiki/` folder mirrors the GitLab project wiki for closed-network deployments. It is hand-maintained in Hebrew; copy its contents into your `<project>.wiki.git` repo after each refresh.

## Architecture

| App / Package | Description | Port |
|---|---|---|
| `apps/frontend` | Vite + React 19 SPA — the editor UI | 3000 |
| `apps/server` | Fastify + Node.js. **API** (port 4001, `pnpm dev`) handles uploads + enqueues render jobs; **Worker** (probe port 8081, `pnpm dev:worker`) consumes the queue + runs FFmpeg. The two are separate scripts; root `pnpm dev` only starts the API. | 4001 / 8081 |
| `apps/iframe-demo` | Angular 21 harness for iframe integration testing | 8080 |
| `apps/core-mock` | Dev-only Fastify mock of the upstream Core service | 8002 |
| `apps/mock-vod` | Dev-only Fastify mock of the upstream VOD service | 5050 |
| `packages/contract` | `@video-editor/contract` — Zod schemas/types. Subpaths: `/iframe/from-parent`, `/iframe/to-parent`, `/events`, `/internal/*` | — |

## Prerequisites

- Node.js 22.18+
- pnpm 10+
- Git
- Docker Desktop — must be **running** before `docker compose up`

## Getting Started

Setup splits into two paths. Pick the one that matches your environment.

### Path A — Open network (this GitHub repo)

> [!IMPORTANT]
> The sibling clone must be named exactly `observability-sdk` and sit at the same parent directory as `video-editor`. `pnpm-workspace.yaml` overrides `@ztube/observability` to `link:../observability-sdk` — the path is hard-coded.

```bash
# 1. Clone both repos as siblings
git clone https://github.com/Zetro-Crew/observability-sdk.git
git clone https://github.com/Zetro-Crew/video-editor.git

# 2. Build the observability SDK first — its exports require dist/
cd observability-sdk
pnpm install
pnpm build

# 3. Install + build video-editor — build is required because
#    packages/contract emits dist/ and `pnpm dev` does not trigger
#    upstream builds via Turborepo.
cd ../video-editor
pnpm install
pnpm build
```

> [!NOTE]
> **Open-network CI** (`.github/workflows/ci.yml`) does not clone the SDK. It copies a no-op stub (`tools/observability-stub`) into the `link:../observability-sdk` path before install, so checks run without the real package. This is CI-only and never ships. When server code consumes a new `@ztube/observability` export, update the stub.

### Path B — Closed network

> [!NOTE]
> The closed-network repo ships a `pnpm-workspace.yaml` without the `@ztube/observability` override; the SDK is resolved from the internal registry.

```bash
git clone <internal-git>/video-editor.git
cd video-editor
pnpm install
pnpm build
```

### Run (both paths)

```bash
# Infrastructure — make sure Docker Desktop is running
docker compose up -d           # MinIO :9000 / :9001, RabbitMQ :5672 / :15672

# Start API, frontend, iframe-demo, and the two mocks
pnpm dev

# In a second terminal, start the render worker
# (root `pnpm dev` does not include it)
cd apps/server && pnpm dev:worker
```

`apps/server/.env` is committed with working dev defaults; edit it in place to override values.

### Server environment

Key variables (all have defaults that work for local dev):

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

## Local Dev Networking

The frontend dev server (Vite, port 3000) proxies API traffic to the server so the browser can use relative paths:

- `render`, `uploads`, `upload`, `cleanup`, `edit-video` → server (`http://localhost:4001`)
- `/editor/preview-source`, `/editor/segment`, `/editor/demo-assets`, `/editor/export` → server
- `/private/(media|users|channels|storage|videos)` → Core mock (`http://localhost:8002`)

Uploads use the presigned-URL flow: the client requests a signed URL from `/upload/signed-url`, then `PUT`s the file directly to MinIO on `http://localhost:9000`. MinIO CORS in `docker-compose.yaml` allows `http://localhost:3000` and `http://localhost:8080`.

**Optional frontend env:**

- `VITE_EDITOR_PARENT_ORIGINS` — comma-separated allowed origins for iframe postMessage (required when embedding the editor in an iframe).

## Workspace Commands

```bash
pnpm dev          # Run all apps in parallel (worker excluded — see above)
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
