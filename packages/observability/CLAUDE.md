# observability Package

> **Closed network deployment:** OTLP collector and Pyroscope server must be reachable inside the cluster. Do not introduce SaaS endpoints, public CDN scripts, or runtime calls to public URLs.
>
> **Keep this file updated:** Update whenever exports, instrumentations, config fields, or the Fastify plugin contract change.

Published as `@ztube/observability`. Two subpath patterns — one root barrel, one Fastify-specific bundle.

| Subpath | Purpose | Audience |
|---|---|---|
| `@ztube/observability` | Telemetry init, tracing helpers, logger, stage monitor | Every service |
| `@ztube/observability/fastify` | Fastify request/response logging plugin + `HttpError` | Fastify HTTP entrypoints only |

`HttpError` is intentionally **not** re-exported from the root: the Fastify plugin's `onError` hook owns the shape, so importing `HttpError` outside an HTTP boundary is almost always wrong.

## Commands

```bash
pnpm build        # tsc -p tsconfig.json
pnpm test         # vitest run
pnpm type-check   # tsc -p tsconfig.json --noEmit
pnpm lint         # biome check . --write
pnpm example:fastify   # node dist/example/otel/fastify/init.js
```

## Source Structure

```
src/
├── index.ts                          # root export
├── config.type.ts                    # LoggerPort, ZOtelConfig, ZBaseConfig
├── logger.ts                         # LoggerManager (Pino wrapper) + Logger singleton
├── monitor/
│   ├── monitor.ts                    # createZMonitor + ZMonitor lifecycle
│   └── monitor.config.ts             # Monitor interface, MONITOR_STATUS constants
├── open-telemetry/
│   ├── core.ts                       # initTelemetry, addCustomSpan, isSampled, pyroscopeMiddleware
│   └── metrics.ts                    # metricsService (ZMetricsService singleton) — INTERNAL
├── fastify/
│   ├── index.ts                      # fastify subpath export
│   ├── fastify.ts                    # fastifyLoggingPlugin (onRequest/onSend/onError)
│   ├── fastify.types.ts              # httpLoggingOptions, RouteLogConfig, LogSelectingContext, LOG_PHASE
│   ├── fastify.errors.ts             # HttpError class
│   └── fastify.utils.ts              # getRouteConfig / getBaseFields / getDurationMs / resolveLogMessage
├── example/
│   ├── monitor-example/              # createZMonitor lifecycle demo
│   └── otel/
│       ├── fastify/                  # full Fastify service with tracing + metrics + Pyroscope
│       └── express/                  # same demo on Express (framework-portability check)
└── __tests__/                        # unit tests for monitor, metrics, otel core
```

## Public Surface

### Root (`@ztube/observability`)

| Export | Kind | Source | Purpose |
|---|---|---|---|
| `initTelemetry(config: ZOtelConfig)` | function | `open-telemetry/core.ts` | Boot NodeSDK + OTLP exporters + host/runtime metrics + optional Pyroscope; installs SIGTERM/SIGINT shutdown hooks |
| `addCustomSpan<T>(name, async (span) => T)` | function | `open-telemetry/core.ts` | Open a tracer span, wrap callback in Pyroscope labels when profiling on, record exception + `SpanStatusCode.ERROR` on throw |
| `isSampled()` | function | `open-telemetry/core.ts` | `true` if the active span is recording (or no span). Use to guard expensive log/attribute work |
| `pyroscopeMiddleware(req, res, next)` | function | `open-telemetry/core.ts` | Express-style middleware; attaches `trace_id`/`span_id`/`profile_id` Pyroscope labels for the request duration |
| `Logger` | const `LoggerPort` | `logger.ts` | Singleton wrapping `LoggerManager` — reconfigured by `initTelemetry` |
| `LoggerManager` | **type-only** export | `logger.ts` | Class name exposed as a `type` (`export { Logger, type LoggerManager }`). Use it for typing only — call `Logger.createChild` instead of `LoggerManager.create` |
| `LoggerPort` | type | `config.type.ts` | Logger interface — DI on this, not on `LoggerManager` |
| `createZMonitor(config, extraInfo?)` | function | `monitor/monitor.ts` | Stage lifecycle logger: `logStarted` → `logSuccess` / `logRetry` / `logAborting` / `logInvalidInput`. Adds `processName`/`stageName`/`businessId`/`durationMs` to every payload |

### Fastify (`@ztube/observability/fastify`)

| Export | Kind | Source | Purpose |
|---|---|---|---|
| `fastifyLoggingPlugin` | Fastify plugin | `fastify/fastify.ts` | Registers `onRequest` / `onSend` / `onError` hooks. Options: `enableByDefault`, `logStarted`, `logSuccess`, `enableProfiling` |
| `HttpError` | class | `fastify/fastify.errors.ts` | Fastify-aware error. Fields: `statusCode`, `message`, `expose` (default 4xx→true / 5xx→false), `cause`, `details` |
| `HttpErrorOptions` | type | `fastify/fastify.errors.ts` | Constructor shape |
| `RouteLogConfig` | type | `fastify/fastify.types.ts` | Per-route override on `routeOptions.config`: `logHttp`, `logStarted`, `logSuccess`, `selectFields`, `message` |
| `LogSelectingContext` | type | `fastify/fastify.types.ts` | Argument shape for `selectFields`: `{ reply?, req?, durationMs?, payload?, phase?, error? }` |
| `LOG_PHASE` | const enum | `fastify/fastify.types.ts` | `"STARTED" \| "SUCCESS" \| "ERROR"` — discriminator passed into `selectFields` |

## Internal-only

These exist in `src/` but are **not** part of the package's exports. Do not import them from outside this package — they may change without semver:

- `open-telemetry/metrics.ts` — `metricsService` (`ZMetricsService` singleton). Prefixes every metric with `"biz."`. Used by the in-repo example apps only. If you need application-level metrics, add a real public API instead of reaching into this file.
- `fastify/fastify.utils.ts` — helpers for the plugin's hook bodies (`getRouteConfig`, `getBaseFields`, `getDurationMs`, `resolveLogMessage`).
- `logger.ts → InternalLogger` — mutable handle that `initTelemetry` reconfigures via `LoggerManager#configure`. The class itself is type-only at the package boundary; consumers must use `Logger` (the `LoggerPort` view) and `Logger.createChild(...)` for sub-contexts.
- `MONITOR_STATUS` constants — emitted into log payloads, not exported.

## Sampling and error-logging contract

Two rules drive every observability decision in this package:

1. **Errors always log.** `fastifyLoggingPlugin.onError` and `ZMonitor.logAborting` / `logInvalidInput` ignore the sampler.
2. **Non-error logs respect the sampler.** `fastifyLoggingPlugin.onRequest` / `onSend` and `ZMonitor.logStarted` / `logSuccess` / `logRetry` short-circuit when `isSampled()` is `false` — i.e. when the trace was dropped by `samplingRatio`. With no active span, `isSampled()` returns `true` so local dev still logs everything.

When deriving HTTP status in the error path, the plugin duck-types on `error.statusCode` rather than reading `reply.statusCode` (which can be stale). This covers `HttpError`, native `FastifyError` validation, and any future shape with a numeric `statusCode`.

## Bundled OTel instrumentations

`initTelemetry` registers these — adding new packages without updating this list will silently leave them un-traced:

- `@opentelemetry/instrumentation-http`
- `@fastify/otel` (Fastify request/response spans)
- `@opentelemetry/instrumentation-amqplib`
- `@opentelemetry/instrumentation-aws-sdk`
- `@opentelemetry/instrumentation-redis-4`
- `@opentelemetry/instrumentation-mongodb`
- `@opentelemetry/instrumentation-pino` (log↔trace correlation)
- `@opentelemetry/instrumentation-runtime-node` (5 s precision for GC + event loop)

Host metrics (`@opentelemetry/host-metrics`) start alongside the runtime instrumentation. Metric reader is `PeriodicExportingMetricReader` with a 5 s export interval over OTLP gRPC.

## Dependencies of note

- **`@opentelemetry/sdk-node`** v0.208 — must boot **before** any module being instrumented. Consuming apps put `initTelemetry` at the very top of their entrypoint.
- **`@pyroscope/nodejs`** v0.4 — optional. `pyroscopeServerAddress` flips a module-level `isProfilingEnabled` flag that `addCustomSpan` + `pyroscopeMiddleware` read; nothing happens at runtime when it stays off.
- **`pino`** v10 — ISO timestamps, numeric levels, `stdSerializers.err`. Reads `LOG_LEVEL` from env when `level` is not passed explicitly.
- **`fastify-plugin`** — used to expose hook registration to the parent Fastify instance (no encapsulation).

## When updating this package

If you add an export, also:
1. Update the public-surface tables above.
2. Update `README.md` (the user-facing doc) — same export needs an end-user example.
3. If it is a new OTel instrumentation, add it to the bundled list above.
4. If it changes the sampling/error-logging contract, update that section *and* the `README.md` "Sampling-aware logging" note.

The two doc files diverge intentionally: `README.md` is consumer-facing onboarding, `CLAUDE.md` is the operating manual for changing this package.
