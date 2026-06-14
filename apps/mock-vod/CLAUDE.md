# Mock VOD App

> **Closed network deployment** policy applies to the real VOD service this mock emulates. Mock itself is dev-only — never deployed.

Fastify mock of the upstream VOD HTTP contract. Port **5050** (env `MOCK_VOD_PORT`). Pairs with `apps/core-mock` (port 8002).

## Why

Production runs in an air-gapped network — the real VOD service is unreachable from a dev box. Without this mock, `apps/server`'s preview pipeline either falls back to a divergent demo branch or cannot run at all. With this mock, the editor server runs the **same** code path locally as in prod (no demo branches).

## Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/__internal/register-token` | core-mock posts `{ token, recordingId, ttlMs }` after issuing a `vod-token` so this mock recognises it |
| GET | `/__internal/fixture-window` | Returns `{ startMs, endMs, recordingId }` — used by core-mock to clip ranges and by the server to log the active window on boot |
| GET | `/vod/:recordingId/manifest.mpd` | Byte-faithful MPD fixture (matches real-prod shape: nested `<BaseURL>`, image AdaptationSet, non-numeric Representation id) |
| GET | `/vod/:recordingId/media/*` | DASH segments (`v4_init.mp4` + 40 segments `segment_v4_2362.m4s` … `segment_v4_2401.m4s`, 15s each → 600s total) |

Manifest + segment routes require `vod-token` header — 401 on missing/unknown/expired.

## Footgun

Default `TOKEN_TTL_MS=600_000` (10 min). Preview playlists bake the token into segment URLs — pause playback past the TTL and segments 401. Real VOD has the same constraint; mock surfaces it locally. Note the fixture itself is also 10 min long — tokens expire right as the asset ends, so anything that scrubs across the whole window from a single `/play` call will hit the boundary.

## Commands

```bash
pnpm dev          # node --watch --env-file=.env src/main.ts
pnpm start        # production-style start
pnpm test         # vitest run
pnpm type-check   # tsc --noEmit
pnpm lint         # biome check . --write
```

## curl examples

```bash
# Probe the fixture window
curl http://localhost:5050/__internal/fixture-window

# Manifest (token issued by core-mock /private/channels/:id/play)
curl -H "vod-token: <token>" http://localhost:5050/vod/demo-recording/manifest.mpd

# Segment
curl -H "vod-token: <token>" http://localhost:5050/vod/demo-recording/media/v4_init.mp4 -o init.mp4
```

## Structure

```
src/
  main.ts              # entrypoint — buildMockVod() + listen
  index.ts             # buildMockVod factory (used in tests too)
  config.ts            # fixture window + recording id + defaults
  token-store.ts       # in-memory Map<token, {recordingId, expiresAt}>
  routes/
    register-token.ts
    fixture-window.ts
    manifest.ts
    segment.ts
  fixture/             # static MPD + DASH binaries
  __tests__/           # vitest specs
```
