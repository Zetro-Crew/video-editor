# Deployment

How to build and deploy the video-editor server stack into a closed, air-gapped network.

## Topology

One container image, two deployments:

| Process | Entrypoint | Port | Role |
|---|---|---|---|
| **API** | `node src/index.ts` | `4001` (HTTP) | Accepts uploads, serves preview requests, **enqueues** render commands on RabbitMQ. Returns `202 { id }` and gets out of the way. |
| **Worker** | `node src/worker.ts` | `8081` (probe + Prometheus metrics) | Consumes the `render.requested` queue, runs FFmpeg, publishes `export.*` events. |

Same image, same env schema. Only `command`/`args` differ in K8s. The DI container splits them via `buildApiContainer` and `buildWorkerContainer` in `src/bootstrap/container.ts`. See [ADR 0005](../architecture/adr/0005-render-worker-deployment) for the why.

## Image build

`Dockerfile` at the repo root. Three stages:

1. **`pruner`** — runs `turbo prune @video-editor/server --docker` to slim the workspace to just what the server needs (plus its transitive workspace packages).
2. **`deps`** — `pnpm install --frozen-lockfile` against the pruned manifests, then `pnpm --filter @video-editor/server deploy --prod --legacy /prod/server` to materialise production-only deps under `/prod/server`.
3. **`runtime`** — copies `/prod/server` with UID 1001 / GID 0 (OpenShift-friendly), runs `node src/index.ts` by default. The worker overrides the command in its K8s spec.

Build:

```bash
docker build --build-arg NODE_IMAGE=<your-internal-node:22.18> \
  -t <your-registry.internal>/video-editor-server:<tag> .
```

`NODE_IMAGE` is a build arg — point it at your internal Node 22.18+ base image. There is no default; closed-network builds always pin to a vetted internal image.

Push to your internal registry:

```bash
docker push <your-registry.internal>/video-editor-server:<tag>
```

Both API and Worker deployments pull this same image.

## K8s manifests

Worker manifests live in [`deploy/worker/`](https://example.invalid/deploy/worker/) in the repo. They cover the worker only; the API manifest is environment-specific and not committed.

| File | Purpose |
|---|---|
| `deployment.yaml` | Worker Deployment — `command: ["node"]`, `args: ["src/worker.ts"]`, probes, resource limits, anti-affinity, mTLS volume mounts |
| `service.yaml` | ClusterIP exposing the probe + metrics port |
| `configmap.yaml` | Non-secret env: probe port, FFmpeg knobs, S3 bucket/region/prefix, MPD transcode tunables |

Filled-in fields you must edit before applying:

- `metadata.namespace` (all three files)
- `containers[0].image` in `deployment.yaml`
- `S3_BUCKET` and `S3_ENDPOINT` in `configmap.yaml`
- The `imagePullSecrets` name if you use a different secret for your internal registry
- The `splunk::ztube` Collectord index if your environment uses different log labels

Apply:

```bash
kubectl apply -f deploy/worker/configmap.yaml
kubectl apply -f deploy/worker/service.yaml
kubectl apply -f deploy/worker/deployment.yaml
```

## Required infrastructure

### RabbitMQ

Production must speak mTLS over `amqps://`. The server detects the scheme and reads three PEM files at boot:

| Path | Purpose | K8s source in `deploy/worker/deployment.yaml` |
|---|---|---|
| `/bundle.pem` | Private CA bundle | `Secret/ssl-values`, key `bundle.pem`, `subPath`-mounted |
| `/tmp/certificates/rabbitmq/rabbit_cert.pem` | Client certificate | `Secret/rabbit-values`, key `rabbit_cert.pem` |
| `/tmp/certificates/rabbitmq/rabbit_key.pem` | Client key | `Secret/rabbit-values`, key `rabbit_key.pem` |

`mode: 0400` on all three. The AMQP URL carries no userinfo — the broker authenticates clients by certificate.

The server asserts AMQP topology on connect:

| Exchange | Type | Notes |
|---|---|---|
| `video-editor` | topic | Public events: `export.started`, `export.completed`, `export.failed` |
| `video-editor.commands` | direct | Server-internal: `render.requested` |
| `video-editor.commands.dlx` | direct (DLX) | Dead-letter target for `render.requested` |

Queues:

| Queue | Type | Notes |
|---|---|---|
| `render.requested` | quorum, durable, `x-delivery-limit=5`, `x-overflow=reject-publish`, `x-max-length=10000` | Optional `x-message-ttl` from `RENDER_REQUEST_TTL_MS` |
| `render.dead` | DLX-bound | DLQ consumer in the worker publishes terminal `export.failed { error: "max retries exceeded" }` |

### S3 / MinIO

Any S3-compatible object store works. The server uses path-style addressing (`S3_FORCE_PATH_STYLE=true`) so it speaks to MinIO out of the box.

Bucket bootstrap:

- If `S3_AUTO_CREATE_BUCKET=true` (default), the API creates the bucket on startup if missing.
- Otherwise create it ahead of time with the configured `S3_BUCKET` name.

CORS:

- Set `MINIO_API_CORS_ALLOW_ORIGIN` (or your provider's equivalent) to the comma-separated list of parent origins. Browsers PUT files directly to MinIO via presigned URLs.
- Local dev's `docker-compose.yml` sets this to `http://localhost:3000,http://localhost:8080` as the template.

Prefixes (one bucket, three logical roots):

| Var | Default | Used by |
|---|---|---|
| `S3_UPLOAD_PREFIX` | `uploads` | Direct-to-S3 uploads (API only) |
| `S3_PREVIEW_PREFIX` | `preview` | HLS preview playlists + segments (API only) |
| `S3_OUTPUT_PREFIX` | `output` | Worker-written render output; API reads to derive idempotency keys |

**`S3_OUTPUT_PREFIX` must match across API and Worker** — render idempotency depends on a deterministic key derived from `jobId`.

### Core + VOD upstream services

Set `CORE_BASE_URL` to the real Core service's `/private` base URL (the editor server appends route paths to it). The server forwards the `ztube-token` cookie it receives from the parent app on each `/private/channels/:id/play` call. See [ADR 0003](../architecture/adr/0003-iframe-auth-via-httponly-cookie).

In production, Core and VOD share a domain behind a reverse proxy. The mocks in dev (`apps/core-mock`, `apps/mock-vod`) emulate the same HTTP contract — see [ADR 0002](../architecture/adr/0002-mock-vod-as-separate-app).

## Required env (production-required)

| Var | Purpose |
|---|---|
| `QUEUE_URL` | AMQP URL. `amqps://…` triggers mTLS. Neither API nor Worker starts without it. |
| `S3_BUCKET` / `S3_ENDPOINT` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | S3 connection. |
| `SERVER_BASE_URL` | Public URL of the API. Baked into signed segment URLs. |
| `PREVIEW_SIGNING_SECRET` | HMAC-SHA256 secret (min 32 chars) for `/editor/segment` signing. **Without this the proxy is an SSRF vector — server refuses to start.** |
| `CORE_BASE_URL` | Upstream Core `/private` base URL. |

Optional knobs (defaults are sensible for most deployments) are listed in [architecture/apps/server](../architecture/apps/server).

## Health and readiness

Both processes expose probes:

| Process | Path | Port |
|---|---|---|
| API | `GET /health` | `PORT` (`4001`) |
| Worker | `GET /health`, `GET /ready` | `WORKER_PROBE_PORT` (`8081`) |
| Worker (metrics) | `GET /metrics` (Prometheus) | `WORKER_PROBE_PORT` |

Worker probes settings used in the committed `deployment.yaml`:

| Probe | initialDelay | period | failureThreshold |
|---|---|---|---|
| readiness | 5s | 5s | 3 |
| liveness | 30s | 30s | 3 |

> **Heads up:** the committed `configmap.yaml` sets `WORKER_PROBE_PORT: "8080"` while `deployment.yaml`'s container exposes `containerPort: 8081`. Decide one value and align both before deploying. This wiki page does not assert which is correct — check your team's current value.

## Graceful shutdown

- **API.** Stop HTTP → publisher `drain(5s)` → publisher `close()`. The publisher's `close()` cancels any pending reconnect timer and rejects in-flight waiters.
- **Worker.** Cancel AMQP consumer → wait for in-flight render up to ~540s → publisher `drain(5s)` → publisher `close()` → probe server stop.
- K8s: `terminationGracePeriodSeconds: 600` on the worker. Sized to the render duration. Renders exceeding the budget are `SIGKILL`'d; their messages are redelivered to a sibling worker. Each SIGKILL counts toward `x-delivery-limit=5`.

## Closed-network reminders

- Bundle everything. FFmpeg is shipped via `@ffmpeg-installer/ffmpeg`; no system FFmpeg dependency.
- No public CDN links anywhere in served HTML/JS.
- All upstream URLs (Core, VOD, S3, RabbitMQ, OTel collector, Pyroscope) must be reachable from inside the network.
- No external package fetches at runtime — `pnpm install` runs against your internal registry only.
