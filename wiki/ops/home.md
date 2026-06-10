# Ops

Deploying and operating the video editor in production (closed/air-gapped network).

## Pages

- [Deployment](deployment.md) — image build, two-process topology (API + Worker), required infra, secrets and certs, K8s manifests.
- [Monitoring](monitoring.md) — OpenTelemetry tracing/metrics, Pyroscope profiling, Pino logs, probes, key alert metrics.
- [Runbooks](runbooks.md) — common incident patterns derived from the system's error paths. Generic patterns to adapt; not a record of past incidents.

## At a glance

- One image, two entrypoints: API (`src/index.ts`, port 4001) and Worker (`src/worker.ts`, probe 8081). Same env schema, different `command`/`args` in K8s.
- Required infra: RabbitMQ (mTLS in production), S3-compatible object storage (MinIO/AWS S3/etc.), the upstream Core + VOD services.
- Required secrets: S3 credentials, AMQP URL, three PEM files for mTLS, HMAC signing secret for segment proxy.
- Worker graceful shutdown: `terminationGracePeriodSeconds: 600` — sized to render duration, not a typo.
