# React Video Editor

<p align="left">
  <img src="apps/frontend/public/icon.svg" alt="React Video Editor" width="48" height="48">
</p>

A full-stack, browser-based video editor built on [Remotion](https://www.remotion.dev/) and React 19. Compose scenes on a drag-and-drop timeline, apply transitions and overlays, then export to video — all from the browser.

> **Deployment target:** Closed, air-gapped network environments. All infrastructure (MinIO, Redis, FFmpeg) is self-hosted. No public internet access is required or expected at runtime.

## Architecture

| App / Package | Description | Port |
|---|---|---|
| `apps/frontend` | Vite + React 19 SPA — the editor UI | 3000 |
| `apps/server` | Fastify + Node.js API — upload, render, FFmpeg | 4000 |
| `apps/iframe-demo` | Angular 21 harness for iframe integration testing | 4200 |
| `packages/editor-contract` | Shared postMessage types (`@video-editor/iframe-contract`) | — |

## Prerequisites

- Node.js 22.18+
- pnpm 10+
- Docker (for MinIO + Redis)
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

This starts MinIO (S3-compatible storage, port 9000/9001) and Redis (port 6379).

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
| `REDIS_HOST` | `localhost` | Redis host |

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
- **Export pipeline** — Remotion renders final video on the server
- **iframe embedding** — embed the editor in any page via postMessage API

## iframe Integration

The editor can be embedded at `/editor/embed` and controlled via `postMessage`. The `@video-editor/iframe-contract` package provides typed schemas for the protocol.

See [packages/editor-contract/README.md](packages/editor-contract/README.md) and [apps/iframe-demo/README.md](apps/iframe-demo/README.md) for details.

## Tech Stack

**Frontend:** React 19, Vite, Remotion, Zustand, TanStack Query, Tailwind v4, shadcn/ui, `@designcombo/*`

**Server:** Fastify 5, Node.js 22, FFmpeg (bundled via `@ffmpeg-installer/ffmpeg`), Redis, AWS SDK v3 (S3/MinIO), Zod, Sharp

**Tooling:** pnpm, Turborepo, Biome, TypeScript, Vitest, Playwright
