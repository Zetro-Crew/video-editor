# Events Module — `@video-editor/contract/events`

> See the [package README](../../README.md) for the full export map and the iframe protocol.

Versioned AMQP event contracts published by `apps/server` to RabbitMQ. This doc is for **external consumer teams** building services that react to render-job lifecycle events.

The module ships routing-key constants, the `Envelope<T>` shape, and per-event Zod schemas — import them to type-check consumers and validate messages on receipt.

## Exchange

| Name | Type | Durable |
|---|---|---|
| `video-editor` | topic | yes |

All events publish to this single exchange. Bind your queue against it with a routing-key pattern that matches the events you care about.

## Routing Keys

Pattern: `<domain>.<action>` (lowercase, dot-separated).

| Routing Key | Event | Schema |
|---|---|---|
| `export.started` | Render job started | `exportStartedEnvelopeSchema` |
| `export.completed` | Render output uploaded | `exportCompletedEnvelopeSchema` |
| `export.failed` | Render job failed | `exportFailedEnvelopeSchema` |

Bind all export events with `export.#` or pick selectively with `export.completed`.

## Envelope Shape

Every message body is the same envelope:

```ts
type Envelope<T> = {
  eventName: string;       // matches routing key
  eventVersion: number;    // schema version, starts at 1
  occurredAt: string;      // ISO-8601 UTC timestamp
  traceparent?: string;    // W3C trace context (optional)
  data: T;                 // event-specific payload
};
```

Body is JSON. `contentType: application/json`. `persistent: true` (delivery-mode 2).

## AMQP Headers

| Header | Value | Purpose |
|---|---|---|
| `x-event-name` | e.g. `export.started` | Filter without parsing body |
| `x-event-version` | e.g. `1` | Version routing without parsing body |

Headers always match the envelope fields. Consumers may use either.

## Binding a Queue

Example via `rabbitmqadmin`:

```bash
rabbitmqadmin declare queue name=my-team-export durable=true
rabbitmqadmin declare binding source=video-editor destination=my-team-export routing_key='export.#'
```

Example consumer (Node + amqplib):

```ts
import { exportStartedEnvelopeSchema } from "@video-editor/contract/events";

ch.consume("my-team-export", (msg) => {
  if (!msg) return;
  const body = JSON.parse(msg.content.toString());
  const parsed = exportStartedEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    ch.nack(msg, false, false); // route to DLX
    return;
  }
  // ... handle parsed.data
  ch.ack(msg);
});
```

## Versioning Policy

- **Additive change** (new optional field): same `eventVersion`. Old consumers still parse.
- **Breaking change** (rename, remove, retype field): new `eventVersion`. Server publishes both old and new in parallel for at least 4 weeks. Schedule the cutover with consuming teams.

## Dead-Lettering

Consumer-side concern. Each team binds its own queue with its own DLX policy. The publisher does not configure DLX.

## Delivery Guarantees

- **Publisher** uses confirms + `mandatory: true`. The server treats broker-ack as success; unrouted or unconfirmed messages are logged and retried.
- **Consumer** must use manual ack. Ack only after processing succeeds. Nack-without-requeue on schema validation failure (route to your DLX).
- **At-least-once**. Consumers must be idempotent (key on `data.jobId`).
- **`export.started` may publish more than once for the same `jobId`.** Render
  jobs run on a separate worker fronted by a quorum queue with broker-side
  retry; every redelivery emits a fresh `export.started` before FFmpeg begins.
  Dedupe on `data.jobId`.
- **`export.failed` with `error: "max retries exceeded"`** is published by the
  server's DLQ consumer after a render job is dead-lettered past the broker's
  retry budget. Treat this as a terminal failure for that `jobId`.
