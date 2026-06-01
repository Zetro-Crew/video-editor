# @video-editor/core-mock

Mock Core service for the video-editor monorepo. Emulates the upstream Core HTTP contract (user identity, channel list, Channel Play API) so `apps/server` can run locally against the same code path used in production.

Port: **8002** (default). Pairs with `apps/mock-vod` (5050) — coordinates via `POST /__internal/register-token` so cross-service `vod-token` trust mirrors the real Core/VOD relationship.

Routes:

| Method | Path | Description |
|---|---|---|
| GET | `/private/users/me` | Hard-coded user identity |
| GET | `/private/media/clip/managed-virtual-channels` | Hard-coded channel list |
| GET | `/private/channels/:channelId/play?start&end` | Mints a `vod-token`, registers it with `apps/mock-vod`, returns `{ url, timeRanges, token }` |

See [CLAUDE.md](./CLAUDE.md) for the full route shapes, cross-service trust details, env vars, and structure. See [docs/adr/0002-mock-vod-as-separate-app.md](../../docs/adr/0002-mock-vod-as-separate-app.md) for the design rationale.
