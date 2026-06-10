# ADR 0006: amqplib built-in connection recovery for publisher and consumer

- Status: Accepted
- Date: 2026-06-02

## Context

`apps/server` uses amqplib 2.0.1. The publisher (`RabbitMQPublisher`) carried a
hand-rolled reconnect loop with a fixed backoff `[1s, 2s, 5s, 10s]` capped at
30s, no jitter, no retry limit, and an additional "close-and-reopen the
connection on every transient publish error" path inside `publishWithRetry`. The
consumer (`RabbitMQConsumer`) had a similar bespoke loop (post-merge) but it
predated the publisher rewrite and only kicked in via channel/connection close
events; a transient broker blip during the worker's startup window could strand
it until k8s noticed.

amqplib shipped first-class recovery in v1.1.0 (`connect(url, { recovery })`
returns a `RecoveringChannelModel` with documented `connect` / `disconnect` /
`reconnect-scheduled` / `reconnect-failed` / `error` / `handler-error` events
and exposes a `setup` callback that re-runs on every connect — initial and
subsequent). The handler-error surface (v1.0.7) and structured channel-close
error (v1.0.6) require app cooperation to be useful.

## Decision

Replace both bespoke loops with `connect(url, { recovery: { initialDelay:
1s, maxDelay: 30s, factor: 2, jitter: 0.2, maxRetries: Infinity, setup } })`.
Topology assertion runs in the `setup` callback so it re-asserts on every
reconnect. Drop the close-and-reopen branch inside `publishWithRetry` (recovery
handles reconnect; we just retry on the next channel) and reduce the per-message
backoff schedule to `[200ms, 1s]`. Wire `handler-error` listeners on the
recovery model and on every channel. Surface AMQP `code`/`classId`/`methodId`
in error logs.

Fail-fast at startup is preserved via two complementary mechanisms because
`maxRetries: Infinity` means `connect(...)` never rejects on a permanently
unreachable broker (the recovery wrapper's `_scheduleReconnect` only rejects the
initial promise when `_attempt >= maxRetries`):

1. A plain probe `connect(url)` (no recovery) runs first to catch bad URL,
   bad credentials, and bad topology declarations — those failures cleanly
   surface at startup instead of being swallowed by the infinite retry loop.
2. The recovering connect is then raced against `AMQP_INITIAL_CONNECT_TIMEOUT_MS`
   (default 15s) so unreachable brokers cause the process to exit and k8s to
   restart the pod.

`ChannelClosedError` rejects in-flight publish promises when the channel closes
mid-publish. The `ch.on('close')` handler snapshots `inflight` before iterating
so a settle handler that re-enters `publish()` cannot invalidate the iteration.
Events get a `EVENT_PUBLISH_CONFIRM_TIMEOUT_MS` (default 30s) so an event whose
broker confirm never arrives doesn't hang forever (commands already had
`COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS`).

## Consequences

Positive:
- Consumer self-recovers — broker blips no longer require a worker pod restart.
- Single backoff / jitter policy across publisher and consumer.
- Topology re-asserted on every reconnect; reconnect after a broker upgrade
  that lost queue declarations is now safe.
- `handler-error` listeners surface synchronous throws that amqplib pre-v1.0.7
  silently swallowed.
- Structured AMQP error fields (`code`/`classId`/`methodId`) appear in logs.

Negative / tradeoffs:
- The startup probe opens an extra short-lived AMQP connection. Acceptable cost
  for fast-fail diagnostics.
- A second timeout (initial-connect race) is required to compensate for
  `maxRetries: Infinity`; documented in code + CLAUDE.md.
- Publish during the reconnect window awaits a `channelReady` deferred instead
  of immediately throwing. Bounded by `EVENT_PUBLISH_CONFIRM_TIMEOUT_MS` /
  `COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS`.
- `reconnect-scheduled` logs are rate-limited (attempt 1 + every 10th) to avoid
  log flood during sustained outages.

## Validation

Integration tests in
`apps/server/src/infrastructure/messaging/__tests__/RabbitMQPublisher.test.ts`
cover the initial-connect timeout against a hung broker, reconnection after a
forced internal-model close, setup-failure backoff (topology stub throws once,
recovery retries with delay, then succeeds), `ChannelClosedError` settle on
mid-publish channel close, and `handler-error` on both `close` and `return`
listeners (the latter exercises the audit-flagged `entry.settle` path).
