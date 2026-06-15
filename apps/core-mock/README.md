# @video-editor/core-mock

Mock Core service for the video-editor monorepo. Emulates the upstream Core HTTP contract (user identity, channel list, Channel Play API, stored-media watch + play APIs, bundled image/clip/DASH fixtures) so `apps/server` and the editor frontend can run locally against the same code path used in production. Also backs the stored-media `EDITOR_ADD_MEDIA` flow used by `apps/iframe-demo`.

Port: **8002** (default). Pairs with `apps/mock-vod` (5050) — coordinates via `POST /__internal/register-token` so cross-service `vod-token` trust mirrors the real Core/VOD relationship.

Routes:

| Method | Path | Description |
|---|---|---|
| GET | `/private/users/me` | Hard-coded user identity |
| GET | `/private/media/clip/managed-virtual-channels` | Hard-coded channel list |
| GET | `/private/channels/:channelId/play?start&end` | Mints a `vod-token`, registers it with `apps/mock-vod`, returns `{ url, timeRanges, token }` |
| GET | `/private/media/:id/watch` | Returns `{ type, name }` for the stored-media id. Drives the editor's branching on `Image` / `ClipVideo` / `UploadedVideo` / `ScreenShotFromLive` |
| GET | `/private/videos/:id/play` | Returns `{ url, timeRanges }` for video-typed media. `url` points back at this mock's `/private/storage/:id/mpd`. No `token` — Core serves segments under the session cookie |
| GET | `/private/storage/:id/image` | Bundled jpg for `img-001` / `img-002` / `img-003` / `screenshot-001`, 404 otherwise |
| GET | `/private/storage/:id/clip` | 15s 1280×720 H.264/AAC fragmented mp4 (`testsrc2` + DEMO CLIP overlay + 440 Hz tone) for `demo-clip-001`, 404 otherwise |
| GET | `/private/storage/:id/mpd` (+ DASH init/segment paths) | Per-id on-disk DASH bundle (`demo-clip-001` = `testsrc2` + 440 Hz; `uploaded-001` = `smptehdbars` + 880 Hz) |

See [CLAUDE.md](./CLAUDE.md) for the full route shapes, cross-service trust details, env vars, and structure. See [docs/adr/0002-mock-vod-as-separate-app.md](../../docs/adr/0002-mock-vod-as-separate-app.md) for the design rationale.
