# Integrators

You're here if your team **embeds the editor iframe** in a parent app, **consumes AMQP events** the editor publishes, or both. Both surfaces are typed via Zod schemas shipped in `@video-editor/contract`, which is published to the internal package registry — install it like any other internal dependency.

## Pages

- [Iframe Integration](iframe-integration) — embed the editor, drive it with `postMessage`, handle responses.
- [Event Consumers](event-consumers) — bind a queue to the `video-editor` exchange and react to `export.*` events.

## How you get the schemas

Both pages assume `@video-editor/contract` is available in your internal registry. Add it to your service:

```bash
pnpm add @video-editor/contract@<version>
```

Pin the version. The package ships these public subpaths:

| Subpath | Use case |
|---|---|
| `@video-editor/contract/iframe/from-parent` | Parent → editor messages (you send) |
| `@video-editor/contract/iframe/to-parent` | Editor → parent messages (you receive) |
| `@video-editor/contract/events` | RabbitMQ event envelopes (you consume) |

> The `internal/*` subpath is server-private. Do not import it from integrator code — it is the editor server's own HTTP request schemas and may break between releases without notice.
