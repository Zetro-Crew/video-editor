# `@ztube/observability` CI stub

A **no-op** stand-in for the internal `@ztube/observability` package.

## Why this exists

`apps/server` depends on `@ztube/observability`, which lives in the internal npm
registry and is committed as a local `link:../observability-sdk` override in
`pnpm-workspace.yaml`. That registry and that sibling checkout exist in the
closed network and on developer machines — **not** on open-network GitHub
Actions. There, `pnpm install --frozen-lockfile` cannot resolve the link and CI
fails.

The GitHub workflow (`.github/workflows/ci.yml`) copies this directory to the
sibling path the lockfile links to (`$GITHUB_WORKSPACE/../observability-sdk`)
**before** install. pnpm then resolves the link to this no-op package. The
lockfile and `pnpm-workspace.yaml` are never modified, so closed-network builds
keep using the real package.

This is **CI-only**. Nothing here ships to production.

## Keeping it in sync

The exported surface mirrors only what `apps/server` imports from
`@ztube/observability` and `@ztube/observability/fastify`:

- `initTelemetry`, `Logger`, `metricsService`, `addCustomSpan`, `createZMonitor`,
  `HistogramView`
- `/fastify`: `HttpError`, `fastifyLoggingPlugin`, and the `FastifyContextConfig`
  `logHttp` augmentation

When server code starts importing a new export (or an existing signature
changes), add/update it here or CI type-check breaks. Run the fresh-clone
simulation in the repo plan to validate.
