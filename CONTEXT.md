# Domain Glossary

> Single-context repo. See `docs/adr/` for architecture decisions.

## HTTP Schema Validation

Zod is the single validation library for both env config and HTTP request schemas. TypeBox is not used. Type inference uses `z.infer<typeof schema>`.

→ See [ADR 0001](docs/adr/0001-zod-over-typebox.md)

## Messaging

**Publish** — server hands an event envelope to the broker on the `video-editor` topic exchange. Considered successful only when the broker confirms it (publisher confirms). A publish that the broker never acks, or that the broker returns as unrouted, is a failure the server must log and meter.

**Unrouted** — broker received the message but no queue is bound to a matching routing key. Surfaces as a return when published with `mandatory: true`. Treated as a publish failure on the server side.

**Broker Ack** — the broker's confirm that it accepted (and routed) the message. The server's responsibility ends here. Whether a consumer ultimately processes the message is the consuming team's concern, not the server's.

**Event Envelope** — versioned wrapper around the domain payload: `{ eventName, eventVersion, occurredAt, traceparent, data }`. Same shape stamped into AMQP headers (`x-event-name`, `x-event-version`) so subscribers can filter without parsing the body.
