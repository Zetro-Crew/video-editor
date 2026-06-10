# Monitoring

The server and worker emit traces, metrics, profiles, and structured logs via the in-house [`@ztube/observability`](../architecture/apps/observability) package, which wraps OpenTelemetry, Pyroscope, and Pino.

## Signals

| Signal | Source | Exporter |
|---|---|---|
| Traces | OpenTelemetry auto-instrumentation (HTTP, AMQP, AWS SDK, MongoDB, Redis) + custom spans via `addCustomSpan` | OTLP to `OTEL_ENDPOINT` |
| Metrics | OTel host + runtime metrics (CPU, memory, GC, event loop), plus Worker Prometheus endpoint on `/metrics` | OTLP + Prometheus scrape |
| Profiles | Pyroscope CPU + heap, trace-to-profile linking | HTTP to `pyroscopeServerAddress` |
| Logs | Pino structured logs with correlation IDs and trace injection | stdout (JSON), shipped by your log collector |

OTel is **disabled** when `OTEL_ENDPOINT` is unset — useful for local dev.

## Wiring env

| Var | Default | Notes |
|---|---|---|
| `SERVICE_NAME` | `video-editor-server` | Distinguish API vs Worker by setting a different value per Deployment if you want them split in your observability backend. |
| `SERVICE_VERSION` | `1.0.0` | Set this from your image tag in the K8s spec. |
| `LOG_LEVEL` | `info` | Pino levels: `trace`/`debug`/`info`/`warn`/`error`. |
| `OTEL_ENDPOINT` | unset | OTLP collector endpoint. Required for tracing/metrics. |
| `WORKER_PROBE_PORT` | `8081` | Worker probe + Prometheus metrics. |

Pyroscope endpoint is wired in code via `initTelemetry({ pyroscopeServerAddress: … })` — set the value via your `initTelemetry` call in the entrypoint or expose it as your own env var.

## Probe and metrics endpoints

| Process | Endpoint | Returns |
|---|---|---|
| API | `GET /health` | `{ status: "ok" }` — K8s liveness |
| Worker | `GET /health` | liveness |
| Worker | `GET /ready` | readiness — true once the AMQP consumer is registered |
| Worker | `GET /metrics` | Prometheus exposition format |

## Distributed tracing

Spans propagate end-to-end through the `traceparent` field on every AMQP event envelope:

```
parent app fetch → API HTTP handler → publish render.requested
                                            ↓
                                  Worker consume render.requested
                                            ↓
                          publish export.started / export.completed
                                            ↓
                                  consumer team's handler
```

If you consume events, copy `envelope.traceparent` into your own OTel context so your spans link to the editor server's trace. The schema is `string` so plain context propagation works.

Custom spans for FFmpeg, S3 uploads, and AMQP publishes are added at use-case boundaries via `addCustomSpan`. Pyroscope profiles join the trace context automatically when both are enabled.

## Key metrics to alert on

Derived from the server's error paths. Alert names are suggestions — wire to your own metric backend.

### AMQP

| Metric | What it tells you | Threshold idea |
|---|---|---|
| `render.dead.messages_ready > 0` | Render jobs hit `x-delivery-limit=5` and dead-lettered. Each one already produced a terminal `export.failed { error: "max retries exceeded" }`. **P1** — investigate FFmpeg failure root cause. | `> 0` for 1 minute |
| `render.requested.messages_ready` | Queue backlog. Sustained growth → workers can't keep up. | Sustained `> 100` for 15 minutes |
| `render.requested.consumers == 0` | No worker pod is consuming. **P1.** | Any time |
| Publish-confirm timeouts in logs | Broker accepted but never confirmed. The publisher retries; sustained timeouts mean broker stress. | More than a few per minute |
| `unrouted` / `return` events in logs | Mandatory message had no queue binding. Means a consumer team's queue is missing or unbound. | Any |

### FFmpeg / worker

| Metric | Source | What it tells you |
|---|---|---|
| Worker pod CPU near limit (`4000m`) | K8s metrics | FFmpeg is saturating — scale workers up or tune concurrency. |
| Worker pod memory growth | K8s metrics | Likely a hung FFmpeg child or large MPD; watch alongside `TRANSCODE_TIMEOUT_MS`. |
| FFmpeg exit non-zero rate | Logs (search `ffmpeg` + `exit`) | Source quality issues or codec mismatches. |

### S3 / preview

| Metric | What it tells you |
|---|---|
| `/editor/segment` 4xx rate | Likely expired `vod-token` baked into playlists — see [runbooks](runbooks). |
| S3 PUT 5xx rate (uploads + render output) | Storage outage. |

### Application

- HTTP 503 on `/render`: AMQP publish exhausted retries. Broker is sick or the URL/credentials are wrong. See [ADR 0005](../architecture/adr/0005-render-worker-deployment).
- HTTP 5xx on `/editor/preview-source`: usually upstream Core or VOD failure. The request is forwarded to Core; check Core's logs first.

## Logs

Pino JSON to stdout. Key correlation fields:

| Field | Source |
|---|---|
| `traceId` / `spanId` | Auto-injected from OTel context |
| `service.name` / `service.version` | From `SERVICE_NAME` / `SERVICE_VERSION` |
| `processName` (`amqp-publish` / `amqp-consume`) | From `ZMonitor` wrappers |
| `stageName` (e.g., `export.completed`, `render.requested`) | From `ZMonitor` |
| `businessId` (typically `jobId`) | From `ZMonitor` |

Search by `businessId` to follow a single render across API → broker → worker → events.

Notable structured log events (search-friendly):

| Log message | Meaning |
|---|---|
| `amqp_publish_drained_unconfirmed` | Shutdown timed out before broker confirmed the in-flight publish. The message may or may not have routed. |
| `amqp_publisher_channel_handler_error`, `amqp_publisher_model_handler_error` | A synchronous throw inside an amqplib `close`/`error`/`return` handler. Tracks regressions in connection-recovery code. |
| `reconnect-scheduled` (rate-limited: attempt 1 + every 10th) | Broker outage, recovery loop active. |
| `logAborting` | Retry budget exhausted on a publish. Commands → 503 to the client; events → swallowed (and emitted as this log). |
