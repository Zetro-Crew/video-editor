# Event Consumers

The editor server publishes render-job lifecycle events to a single RabbitMQ topic exchange. External teams bind their own queue to it and consume.

## Install

```bash
pnpm add @video-editor/contract@<version> amqplib
```

Pin both versions. `@video-editor/contract` ships from your internal package registry — install it like any other internal dependency. **Do not clone this repo to consume it.**

Import only the public events subpath:

```ts
import {
  EXCHANGE_NAME,
  EXPORT_STARTED,
  EXPORT_COMPLETED,
  EXPORT_FAILED,
  X_EVENT_NAME,
  X_EVENT_VERSION,
  exportStartedEnvelopeSchema,
  exportCompletedEnvelopeSchema,
  exportFailedEnvelopeSchema,
  type ExportStartedData,
  type ExportCompletedData,
  type ExportFailedData,
} from "@video-editor/contract/events";
```

## Exchange + routing keys

| Field | Value |
|---|---|
| Exchange | `video-editor` |
| Type | topic |
| Durable | yes |

| Routing key | Event |
|---|---|
| `export.started` | Render job started (FFmpeg about to run) |
| `export.completed` | Render output uploaded to storage; signed URL in payload |
| `export.failed` | Render job failed (transient errors retried by the broker; the terminal failure carries `error: "max retries exceeded"`) |

Bind your queue with `export.#` to receive all three, or `export.completed` (etc.) to filter.

## Envelope shape

Every message body is the same envelope. Body content type is `application/json`. `persistent: true` (delivery-mode 2).

```ts
type Envelope<T> = {
  eventName: string;       // matches routing key, e.g. "export.completed"
  eventVersion: number;    // schema version (current: 1 for all events)
  occurredAt: string;      // ISO-8601 UTC
  traceparent?: string;    // W3C trace context — propagate this to keep traces linked
  data: T;                 // event-specific payload
};
```

AMQP headers mirror two envelope fields so you can filter without parsing the body:

| Header | Value |
|---|---|
| `x-event-name` | e.g. `export.completed` |
| `x-event-version` | e.g. `1` |

## Event payloads (`data`)

### `export.started`

```ts
type ExportStartedData = {
  jobId: string;
  mediaId: string;
  mediaName: string;
  downloadToComputer: boolean;
  saveToPersonalChannel: boolean;
  selectedUnitChannelIds: string[];
  exportType: "mp4" | "webp";
  items: SavedMediaItem[];
};
```

`SavedMediaItem` is a discriminated union on `type`: `"image" | "clip" | "recording" | "audio"`. Recording and audio items carry a `from`/`to` time range; image and clip items do not.

> **At-least-once warning.** `export.started` may fire more than once for the same `jobId`. Render jobs run on a separate worker fronted by a quorum queue with broker-side retry; every redelivery emits a fresh `export.started` before FFmpeg begins. Dedupe on `data.jobId`.

### `export.completed`

```ts
type ExportCompletedData = {
  jobId: string;
  url: string;             // signed http(s) URL of the rendered output
  exportType: "mp4" | "webp";
};
```

### `export.failed`

```ts
type ExportFailedData = {
  jobId: string;
  error: string;
};
```

Two flavours of failure both surface here:

| `data.error` | Meaning |
|---|---|
| `"invalid envelope"` | The render command was malformed (poison message). The worker acked it; it will not retry. |
| `"max retries exceeded"` | The render exhausted the broker's delivery limit (default 5). This is the terminal signal after retries are done. |
| Any other string | Render attempt failed with a transient error. The broker will redeliver until the delivery limit is hit; a final `export.failed { error: "max retries exceeded" }` will follow if all attempts fail. |

## Bind a queue

Declare your own durable queue and bind it to the exchange. Each team owns its own queue.

Via `rabbitmqadmin`:

```bash
rabbitmqadmin declare queue name=my-team-export durable=true
rabbitmqadmin declare binding \
  source=video-editor \
  destination=my-team-export \
  routing_key='export.#'
```

Or programmatically from your consumer (asserts on first connect; idempotent):

```ts
import { EXCHANGE_NAME } from "@video-editor/contract/events";
await ch.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
await ch.assertQueue("my-team-export", { durable: true });
await ch.bindQueue("my-team-export", EXCHANGE_NAME, "export.#");
```

## Sample consumer

Node + `amqplib`, with Zod validation, manual ack, and version-header routing.

```ts
import { connect } from "amqplib";
import {
  EXCHANGE_NAME,
  EXPORT_STARTED,
  EXPORT_COMPLETED,
  EXPORT_FAILED,
  X_EVENT_NAME,
  exportStartedEnvelopeSchema,
  exportCompletedEnvelopeSchema,
  exportFailedEnvelopeSchema,
} from "@video-editor/contract/events";

const conn = await connect(process.env.QUEUE_URL!);
const ch = await conn.createChannel();

await ch.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
await ch.assertQueue("my-team-export", { durable: true });
await ch.bindQueue("my-team-export", EXCHANGE_NAME, "export.#");

await ch.prefetch(16);

await ch.consume("my-team-export", async (msg) => {
  if (!msg) return;

  const routingKey = msg.fields.routingKey;
  const headerName = msg.properties.headers?.[X_EVENT_NAME] ?? routingKey;

  let body: unknown;
  try {
    body = JSON.parse(msg.content.toString("utf8"));
  } catch {
    ch.nack(msg, false, false); // route to your DLX
    return;
  }

  try {
    switch (headerName) {
      case EXPORT_STARTED: {
        const parsed = exportStartedEnvelopeSchema.safeParse(body);
        if (!parsed.success) { ch.nack(msg, false, false); return; }
        await onExportStarted(parsed.data.data);
        break;
      }
      case EXPORT_COMPLETED: {
        const parsed = exportCompletedEnvelopeSchema.safeParse(body);
        if (!parsed.success) { ch.nack(msg, false, false); return; }
        await onExportCompleted(parsed.data.data);
        break;
      }
      case EXPORT_FAILED: {
        const parsed = exportFailedEnvelopeSchema.safeParse(body);
        if (!parsed.success) { ch.nack(msg, false, false); return; }
        await onExportFailed(parsed.data.data);
        break;
      }
      default:
        // Unknown routing key — nack-without-requeue so it leaves your queue.
        ch.nack(msg, false, false);
        return;
    }
    ch.ack(msg);
  } catch (err) {
    // Transient — let the broker redeliver.
    ch.nack(msg, false, true);
  }
}, { noAck: false });

// Dedupe handlers on data.jobId — at-least-once delivery.
async function onExportStarted(data) { /* … */ }
async function onExportCompleted(data) { /* … */ }
async function onExportFailed(data) { /* … */ }
```

## Delivery guarantees

- **At-least-once.** Consumers must be idempotent. Dedupe on `data.jobId`.
- **Manual ack required.** `noAck: false`. Ack only after processing succeeds.
- **Schema-failure handling.** `nack(msg, false, false)` to route to your own DLX. Do not requeue malformed messages.
- **Transient-failure handling.** `nack(msg, false, true)` to requeue. The publisher cannot help you here — your queue's policies apply.
- **Publisher side.** The editor server uses publisher confirms with `mandatory: true`. A broker-ack is treated as success. Unroutable returns (no queue bound for the routing key) are logged and surfaced — the server itself does not retry beyond a few attempts.
- **Dead-lettering.** Consumer-side concern. The publisher does not configure DLX for your queue. Set up `x-dead-letter-exchange` on your queue declaration if you want unprocessable messages to land somewhere observable.

## Versioning policy

- **Additive change** (new optional field on `data`): same `eventVersion`. Old consumers keep parsing — Zod schemas treat new fields strictly in this repo's policy, so re-pin your `@video-editor/contract` version when you can.
- **Breaking change** (rename, remove, retype): new `eventVersion`. The server publishes both old and new in parallel for at least 4 weeks. Schedule cutover with the producer team.
- Bump your `@video-editor/contract` dependency alongside producer releases to stay schema-aligned. `eventVersion` in the envelope is the runtime safety net — branch on it if you have to support both versions during a migration window.

## Production transport

In production, the broker is reached over `amqps://` (TLS with mutual auth). The editor server reads three PEM files at boot from hardcoded paths:

- `/bundle.pem` — the private CA bundle
- `/tmp/certificates/rabbitmq/rabbit_cert.pem` — client certificate
- `/tmp/certificates/rabbitmq/rabbit_key.pem` — client key

The URL carries no userinfo — the broker authenticates by certificate.

If you are deploying your own consumer in the same cluster, follow the same mTLS pattern (or whatever the broker accepts on your side). See [ADR 0006](../architecture/adr/0006-amqplib-built-in-recovery) for the connection-recovery strategy `amqplib` v1.1+ provides — your consumer should opt into the same to survive broker blips without a pod restart.

Cross-reference: the messaging glossary in [architecture/glossary](../architecture/glossary) defines "Publish", "Unrouted", "Broker Ack", "Event Envelope", and "Broker TLS".
