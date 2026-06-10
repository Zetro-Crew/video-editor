# ADR 0005: Render execution on a durable queue and dedicated worker Deployment

- Status: Accepted
- Date: 2026-06-02

## Context

`POST /render` runs FFmpeg in-process via a fire-and-forget closure on the same
Fastify pod that serves HTTP. Three problems compound:

1. **Pod crash mid-render — work is lost.** Redis state TTL expires; no retry, no
   resume.
2. **No backpressure.** Every API pod accepts unbounded `202`s while the FFmpeg
   semaphore queues internally; memory grows and rollouts time out.
3. **Scale-down / rollout drops jobs.** Graceful shutdown does not wait for jobs
   because there is no job registry.

The Redis state store (`RedisRenderJobStateAdapter`) and `GET /render` polling are
dead code from the client's perspective: the frontend submits the job and never
polls. The real result channel is AMQP events (`export.started` /
`export.completed` / `export.failed`) on the existing `video-editor` topic
exchange, consumed by external systems.

## Decision

Move render execution to a durable RabbitMQ quorum queue (`render.requested`)
consumed by a separate `video-editor-worker` Deployment built from the same
image with a different entrypoint (`src/worker.ts`). Redis render state and
`GET /render` are deleted in the same change; events become the only result
channel.

Locked decisions:

| Topic | Decision |
|---|---|
| Scope | Render only. Preview source prep stays sync HTTP. |
| Broker | Reuse existing RabbitMQ. |
| Topology | New Deployment `video-editor-worker`, same image, separate entrypoint `src/worker.ts`. |
| State store | Drop Redis state and `GET /render` entirely. Events are the sole result channel. |
| AMQP topology | New direct exchange `video-editor.commands`. Queue `render.requested` (quorum, durable, `x-delivery-limit=5`, `x-overflow=reject-publish`, `x-max-length=10000`, optional `x-message-ttl` via env). DLX `video-editor.commands.dlx` → DLQ `render.dead`. Events stay on `video-editor`. Budget = 5 because each SIGKILL during a long render counts toward the limit; 3 is too tight for rolling restarts. |
| `export.started` | Fires from worker on consume (before FFmpeg), not from API. |
| Retry | Broker auto-redelivers up to 5 via `x-delivery-limit`. After exhaustion → DLQ. |
| Terminal event guarantee | DLQ consumer inside worker process: reads `render.dead`, publishes `export.failed { error: "max retries exceeded" }`, acks. |
| Worker concurrency | `WORKER_CONCURRENCY` env, default 1. AMQP prefetch = `WORKER_CONCURRENCY`. |
| Shutdown | SIGTERM → cancel consumer → wait for in-flight up to deadline → drain publisher → close. K8s `terminationGracePeriodSeconds: 600`. |
| Payload | Inline `Envelope<RenderRequested>` with `data = { jobId, ...renderInput, exportType, saveMetadata? }`. Schema internal to server. |
| Producer reliability | New `publishCommand()` uses confirms and throws on exhaustion. Controller catches → 503. Confirm race-timeout configurable via `COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS` (default 10000 ms). Event publisher keeps swallow-on-exhaustion. |
| Idempotency | Before running FFmpeg, consumer does `storage.exists(outputKey)`; if present, publish `export.completed` with the existing presigned URL + ack. Output key derived deterministically from `jobId`. |

## Alternatives considered

- **BullMQ / Redis Streams** — adds a second durable substrate alongside the
  existing RabbitMQ events. Two failure modes to operate, more ops cost in a
  closed network. Rejected.
- **Same exchange for commands and events** — couples consumer fan-out: the
  events topic exchange is bound by external teams; binding a server-internal
  command on it would expose internal contracts. Rejected.
- **Classic queue with TTL + DLX retry** — viable but no per-message delivery
  counter; we would have to encode retry-count in headers and republish, which
  reinvents `x-delivery-limit`. Rejected in favor of quorum queue.
- **Keep Redis state for ops visibility** — there is no remaining consumer
  (frontend abandoned polling), and the events stream is the authoritative
  signal. Keeping it would only fool `knip`. Rejected.
- **Temporal / durable-workflow engine** — closed-network ops cost, separate
  cluster, no existing operator expertise. Rejected; the quorum-queue + DLX
  approach delivers most of the value today.

## Consequences

- `export.started` may publish multiple times for the same `jobId` on
  redelivery — subscribers must dedupe. The events README has been amended.
- `terminationGracePeriodSeconds: 600` reflects render duration, not a typo.
  Renders that exceed the budget are SIGKILL'd; their messages are redelivered
  on a sibling worker. Each SIGKILL counts toward `x-delivery-limit` (5).
- Idempotency relies on a deterministic S3 output key derived from `jobId`.
  Changing the key derivation invalidates the short-circuit.
- Migration is non-reversible after the cutover step (Redis state adapter, the
  Redis client, and `GET /render` are deleted).
- Two image entrypoints (`src/index.ts` for API, `src/worker.ts` for worker).
  Same env-schema, same container; only `command` / `args` differ in K8s.
- `render.dead` accumulating without a worker is a P1: alert on
  `render.dead.messages_ready > 0`.

## Migration sequencing

1. Topology assertion lands in `RabbitMQPublisher.connect()` (declares the new
   exchange, queue, DLX). No behavior change.
2. Worker code + manifest with `replicas: 0`. `publishCommand()` added but not
   called.
3. Cutover (single PR): controller switches to `publishCommand` → 202/503, GET
   `/render` removed, Redis state adapter / port / client / `REDIS_*` env vars /
   `JOB_PROGRESS_TTL_SECONDS` removed. Worker `replicas: 1` in staging on the
   same PR; verify a render end-to-end before merge.
4. Bump worker `replicas: 2` in prod. Watch RabbitMQ queue depth and DLQ depth.
5. Tune `WORKER_CONCURRENCY`, `x-max-length`, and the optional
   `RENDER_REQUEST_TTL_MS` based on observed traffic.
