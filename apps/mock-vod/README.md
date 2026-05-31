# @video-editor/mock-vod

Mock VOD service for the video-editor monorepo. Emulates the upstream VOD HTTP contract (MPD-generate + DASH segment streaming + `vod-token` validation) so `apps/server`'s preview pipeline can run locally against the exact same code path as production.

Port: **5050** (default). Pairs with `apps/core-mock` (8002).

See [CLAUDE.md](./CLAUDE.md) for routes, structure, and the TTL footgun note.
