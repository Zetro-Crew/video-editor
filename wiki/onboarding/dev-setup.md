# Dev Setup

Local environment setup for the video-editor monorepo.

## Prerequisites

- Node.js **22.18+** (TypeScript is executed directly by Node — no `tsx`/`ts-node`).
- pnpm **10+**.
- Docker (for MinIO + RabbitMQ).

## Bring up infrastructure

```bash
docker compose up -d
```

This starts MinIO (S3-compatible storage, ports `9000`/`9001`) and RabbitMQ (`5672`, management UI on `15672`). Default MinIO credentials: `minioadmin` / `minioadmin123`.

## Configure the server

```bash
cp apps/server/.env.example apps/server/.env
```

Defaults work for local dev; the full env schema is documented under [architecture/apps/server](../architecture/apps/server).

## Run everything

```bash
pnpm install
pnpm dev
```

Turborepo runs all apps in parallel.

## Default URLs

| App | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Server API | http://localhost:4001 |
| Iframe demo | http://localhost:8080 |
| Core mock | http://localhost:8002 |
| Mock VOD | http://localhost:5050 |
| MinIO console | http://localhost:9001 |
| RabbitMQ console | http://localhost:15672 |

## Optional frontend env

- `VITE_EDITOR_PARENT_ORIGINS` — comma-separated allowed origins for iframe `postMessage` (set when embedding the editor in another origin's page).
