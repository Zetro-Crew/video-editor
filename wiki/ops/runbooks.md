# Runbooks

Common incident patterns derived from the system's error paths. These are **generic** playbooks built from the code, not a record of past incidents — refine each one with real data as you accumulate it.

Glossary of monitoring/log terms used here: [monitoring](monitoring.md). Architecture-level cross-references: [glossary](../architecture/glossary.md), [ADR 0005](../architecture/adr/0005-render-worker-deployment.md), [ADR 0006](../architecture/adr/0006-amqplib-built-in-recovery.md).

---

## 1. `POST /render` returning 503

**Symptom.** Integrator apps see a burst of `503` responses from `/render`. Frontend export button reports failure.

**Meaning.** `publishCommand` exhausted its 3-attempt retry budget without a broker confirm. The controller maps this to `503` (commands cannot be silently swallowed — the client must know). See [ADR 0005](../architecture/adr/0005-render-worker-deployment.md) and [ADR 0006](../architecture/adr/0006-amqplib-built-in-recovery.md).

**Check.**

1. RabbitMQ pod alive and accepting connections.
2. mTLS PEM file mounts present and readable on every API pod:
   - `/bundle.pem`
   - `/tmp/certificates/rabbitmq/rabbit_cert.pem`
   - `/tmp/certificates/rabbitmq/rabbit_key.pem`
3. `QUEUE_URL` scheme: `amqps://` in production. `amqp://` here would skip the file reads silently.
4. API pod logs for `reconnect-scheduled` (broker unreachable) or `ChannelClosedError` (mid-publish channel close) or `PublishExhaustedError`.
5. Whether `video-editor.commands` exchange and `render.requested` queue exist and have the expected definition. The server asserts them on connect — a `PRECONDITION_FAILED` here means topology drift.

**Mitigate.** Restore the broker. The publisher self-recovers via amqplib's recovery wrapper; no API pod restart needed.

---

## 2. Render stuck — job sits in `export.started` forever

**Symptom.** Integrators receive `export.started` for a `jobId` but never see `export.completed` or `export.failed`.

**Meaning.** The worker may have crashed mid-render, or the render is genuinely long-running. Note `export.started` may fire multiple times for the same `jobId` (broker redelivery); dedupe before assuming "stuck".

**Check.**

1. Worker pods alive (`kubectl get pods -l service=video-editor-worker`).
2. `render.requested` queue depth — backlog means workers are busy, not stuck.
3. `render.requested` consumers > 0. If 0, every render will block until a worker comes back.
4. Worker logs for the `jobId` (`businessId` field): look for FFmpeg child crashes, `OOMKilled`, or hits on `TRANSCODE_TIMEOUT_MS` (default 2h).
5. If the worker pod was `SIGKILL`'d (resource limit, eviction, hung render past `terminationGracePeriodSeconds=600`), the message is redelivered; each SIGKILL counts toward `x-delivery-limit=5`. After 5 → DLQ → terminal `export.failed { error: "max retries exceeded" }`.

**Mitigate.** If the worker is genuinely hung and not progressing, delete the pod. K8s spins up a replacement; the message is redelivered. If the render is too large for the resource limits, raise `cpu`/`memory` in `deploy/worker/deployment.yaml`.

---

## 3. DLQ accumulating (`render.dead.messages_ready > 0`)

**Symptom.** Alerting on `render.dead` queue depth.

**Meaning.** A render hit `x-delivery-limit=5` and dead-lettered. The worker's DLQ consumer has already published a terminal `export.failed { error: "max retries exceeded" }` to integrators — there is no missing terminal signal. This is a quality alert, not a correctness alert.

**Check.**

1. Worker logs filtered by the `jobId`s in the DLQ. Five consecutive failures on the same job — the failure cause is in those logs.
2. Common root causes:
   - FFmpeg crash on a malformed source (look for `Invalid data`, `moov atom not found`, etc.).
   - S3 write failure (`Access Denied`, network timeout).
   - Pod OOM during the render (jobs over the memory limit consistently fail).
3. If many distinct jobs are in the DLQ, the issue is systemic (resource limits, S3 outage, or a regression). If one job is in the DLQ repeatedly… it isn't repeatedly; once dead, it's dead. Distinct jobIds across the DLQ is the expected shape.

**Mitigate.** Drain the DLQ once root cause is fixed. The terminal events have already been delivered to consumers; the DLQ messages themselves are bookkeeping.

---

## 4. Preview segments returning 401 mid-playback

**Symptom.** User opens a preview, plays for a while, then segments start returning `401`. Or: a stored playlist works for the first user, fails for the second.

**Meaning.** The `vod-token` baked into the HLS playlist's segment URLs has expired. Default TTL is ~10 minutes; the playlist itself is stored in S3 and outlasts the token. Pause/idle past the TTL and segments fail. This footgun is mirrored in the [mock-vod CLAUDE.md](../architecture/apps/mock-vod.md) and surfaces locally too.

**Check.**

1. Look for `401` from VOD upstream in `/editor/segment` proxy logs.
2. Compare playlist age (S3 `LastModified`) vs token TTL.

**Mitigate.** Regenerate the playlist by re-calling `POST /editor/preview-source` (the editor frontend does this automatically when the user re-resolves the preview). Long-term: raise the upstream VOD token TTL if your traffic patterns include long idle windows.

---

## 5. `unrouted` warnings in publisher logs

**Symptom.** Log entries showing the broker returned a published message as unroutable.

**Meaning.** The publisher uses `mandatory: true`. An "unrouted" return means the broker received the message but found no queue bound for the routing key. The server treats this as a publish failure (logged + metered).

**Check.**

1. Which routing key? `export.*` (events) or `render.requested` (command)?
2. For events: a consumer team's queue is missing or no longer bound to `video-editor`. Their team owns the binding.
3. For `render.requested`: the worker isn't asserting topology. Check worker startup logs — `assertExchange`/`assertQueue` should succeed. If the broker rejects with `PRECONDITION_FAILED`, the queue exists with mismatched arguments (often `x-delivery-limit` or `x-message-ttl` drift).

**Mitigate.** Restore the missing binding (consumer side) or recreate the queue with the expected arguments (commands side — coordinate with whoever owns the deploy). The publisher will retry on the next attempt.

---

## 6. Broker connection looping (`reconnect-scheduled` spam)

**Symptom.** Logs filling with `reconnect-scheduled` events. Note these are rate-limited — attempt 1 + every 10th — so persistent spam means a long sustained outage.

**Meaning.** The broker is unreachable. The amqplib recovery wrapper is doing its job with `factor: 2`, `maxDelay: 30s`, `jitter: 0.2`, `maxRetries: Infinity`.

**Check.**

1. Broker pod health, network policy, mTLS cert expiry.
2. `AMQP_INITIAL_CONNECT_TIMEOUT_MS` (default 15s) is what makes the server fail-fast at startup. After startup it's the recovery loop's territory.
3. `EVENT_PUBLISH_CONFIRM_TIMEOUT_MS` (default 30s) and `COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS` (default 10s) bound how long an in-flight publish waits during the reconnect window before failing.

**Mitigate.** Restore the broker. Publisher and consumer self-heal; no pod restart required. Background: [ADR 0006](../architecture/adr/0006-amqplib-built-in-recovery.md).

---

## 7. `S3_AUTO_CREATE_BUCKET` failure on API startup

**Symptom.** API pod CrashLoopBackOff right after deploy. Logs show S3 bucket-create failure.

**Meaning.** The configured `S3_ACCESS_KEY_ID` lacks `s3:CreateBucket` (or the equivalent MinIO IAM policy), and `S3_AUTO_CREATE_BUCKET=true` (default). The server refuses to start without a usable bucket.

**Mitigate.** Two options:

1. Pre-create the bucket and set `S3_AUTO_CREATE_BUCKET=false`. Recommended in production — bucket lifecycle should not be a runtime concern.
2. Grant the bucket-create permission to the API's S3 credentials.

---

## 8. Worker shutdown takes a long time

**Symptom.** Rolling deploy stalled on worker pod termination. Pod stays in `Terminating` for several minutes.

**Meaning.** This is **expected behaviour**. `terminationGracePeriodSeconds: 600` lets an in-flight render finish before SIGKILL. The shutdown sequence: cancel consumer → wait up to 540s for in-flight → drain publisher (5s) → close publisher → stop probe server. It's not a leak.

**Check.** Only investigate if shutdown exceeds 600s. That would mean SIGKILL fired before the publisher drained; in-flight broker confirms may have been lost. The message will be redelivered to a sibling worker, so it's a delivery-count cost, not a correctness cost.

---

## 9. Worker probe port mismatch

**Symptom.** Worker pod fails readiness/liveness probes immediately after deploy. K8s reports the probe endpoint is unreachable.

**Meaning.** The committed `deploy/worker/configmap.yaml` sets `WORKER_PROBE_PORT: "8080"` while `deployment.yaml` exposes `containerPort: 8081`. If your environment hasn't reconciled them, the probe targets one port and the process listens on the other.

**Mitigate.** Pick a single value, set it consistently in both files (and `service.yaml` if you proxy it), redeploy. The code itself defaults to `8081`.
