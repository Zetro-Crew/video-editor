# Core Mock App

> Dev-only Fastify mock of the Core HTTP service that runs in prod. Port **8002**.

## Why

The real Core service is unreachable from a dev box (closed network). This mock satisfies the small subset of Core endpoints the editor depends on: user identity, channel list, and the Channel Play API.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/private/users/me` | Returns a hard-coded user identity |
| GET | `/private/media/clip/managed-virtual-channels` | Returns a hard-coded channel list |
| GET | `/private/channels/:channelId/play?start&end` | Mints a `vod-token`, registers it with `apps/mock-vod` over `POST /__internal/register-token`, and returns `{ url, timeRanges, token }` with `url` pointing at mock-vod |

## Cross-service trust

On the first `/play` call, the mock probes `mock-vod`'s `/__internal/fixture-window` (cached for process lifetime) so it can clip the requested range to the available fixture. Every `/play` then mints a base64url token (`randomBytes(18)`) and POSTs it to `/__internal/register-token` on mock-vod. Token TTL defaults to 10 min.

If mock-vod is unreachable, `/play` returns 502 (window probe failure) or logs a warning (register-token failure) but still returns the response. The latter exercises the realistic 401 path on the editor server.

## Commands

```bash
pnpm dev          # node --watch src/main.ts
pnpm start        # node src/main.ts
pnpm test         # vitest run
pnpm type-check   # tsc --noEmit
pnpm lint         # biome check . --write
```

## Env

| Var | Default | Description |
|-----|---------|-------------|
| `CORE_MOCK_PORT` | `8002` | HTTP port |
| `CORE_MOCK_HOST` | `127.0.0.1` | Bind host |
| `MOCK_VOD_BASE_URL` | `http://127.0.0.1:5050` | Where to find apps/mock-vod for cross-service coordination |

## Structure

```
src/
  main.ts             # entrypoint — buildCoreMock() + listen
  index.ts            # buildCoreMock factory (used in tests too)
  __tests__/          # vitest specs
```
