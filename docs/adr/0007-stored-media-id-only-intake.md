# ADR 0007 — Stored-media intake is id-only; editor probes Core

## Status

Accepted — 2026-06-14.

## Context

The parent app (Angular host) drops a stored media item — image, screenshot, clip, or uploaded video — into the embedded editor by posting an `EDITOR_ADD_PREVIEW_ITEM` message. Before this change the contract carried two distinct payload kinds:

- `kind: "image"` — `{ imageId }` plus optional `durationMs` / `name`.
- `kind: "media"` — `{ mediaId, playback: { kind: "mp4" | "hls", src }, durationMs?, posterSrc?, name? }`.

Two payload shapes meant two intake code paths in `payload-intake.ts`, two iframe-demo forms, and an asymmetry: image was id-only and the editor knew how to build the URL, but video required the parent to pre-resolve playback URLs and forward the credential. The parent team asked for full id-only intake — send a `mediaId`, the editor figures out the rest. Trims, names, and overrides are edited inside the iframe after the item lands.

## Decision

A new top-level postMessage type **`EDITOR_ADD_MEDIA { mediaId }`** replaces both `image` and `media` payloads. `EDITOR_ADD_PREVIEW_ITEM` keeps `recording-range` and `audio-range` (those carry time-window fields with no id-only equivalent).

The editor resolves intent by calling Core's existing **`GET /private/media/{id}/watch`** → `{ type, name }`. `type ∈ "Image" | "ClipVideo" | "UploadedVideo" | "ScreenShotFromLive"`. Then:

- `Image` / `ScreenShotFromLive` → editor builds `${VITE_CORE_EXTENSION}/storage/{id}/image`, dispatches `ADD_IMAGE` with default 5000 ms.
- `ClipVideo` / `UploadedVideo` → editor backend resolves playback via a new preview-source variant `{ type: "media-id", mediaId }`. Backend calls `GET /private/videos/{id}/play` → `{ url, timeRanges }`, fetches MPD from `url`, assembles HLS, returns `{ playlistUrl, durationMs, sourceOffsetMs: 0, width, height }`. Editor dispatches `ADD_VIDEO`.

`timeRanges[0][0]` is the wall-clock anchor at media creation. `durationMs = timeRanges[0][1] - timeRanges[0][0]`. The HLS pipeline downstream is unchanged.

Editor responses echo `mediaId` on `EDITOR_PREVIEW_ITEM_ADDED { mediaId, itemId }` and `EDITOR_PREVIEW_ITEM_REJECTED { mediaId, reason }`. Recording-range / audio-range replies still use `requestId` — two correlation patterns coexist intentionally.

Core 404 → `reason: "media not found"`. 5xx / network → `reason: "core unavailable"`. No retry, no placeholder, no fallback.

`vod-token` is **not** issued for media-id sources. Core serves segments directly under the session `ztube-token` cookie. The editor backend's segment-proxy signs URLs with a `kind` discriminator (`channel-range` or `media-id`) baked into the HMAC payload (`${url}\n${token}\n${kind}`) and the URL query, so the proxy knows whether to attach `vod-token` upstream.

`@video-editor/contract` is bumped from `0.1.0` → `0.2.0`. `imagePayloadSchema`, `mediaPayloadSchema`, `mediaPlaybackSchema` are removed from the from-parent union.

## Alternatives Considered

1. **Parent passes the type alongside the id.** Rejected — re-introduces parent-side knowledge of stored-media taxonomy. The parent team explicitly wanted to push that detail into the editor. Also fragile when Core adds new types — parent has to ship a release.
2. **Naming convention (id prefix encodes type).** Rejected — Core ids are opaque uuids in production. Reserving prefixes leaks the editor's branching logic into the data layer and breaks if Core ever changes id format.
3. **Keep `EDITOR_ADD_PREVIEW_ITEM` and add `kind: "stored-media"`.** Rejected — same correlation surface (`requestId`) implies same caching behaviour, but ids without a requestId are the natural correlation key and the round-trip to Core makes the call genuinely async. Splitting message types makes the asymmetry visible in the contract.
4. **Reuse `vod-token` infrastructure for media-id segments.** Rejected — Core serves these segments directly (no separate VOD origin). Minting and validating a token nobody needs is a fake security boundary; the session cookie already authenticates.

## Consequences

- **Contract major break.** Parents on `0.1.0` will fail Zod parse on `image` / `media` payloads. Coordinated rollout required.
- **Async ack on stored-media.** Where `image` previously acked synchronously (no network), every `EDITOR_ADD_MEDIA` now round-trips to Core. Parents that assumed sync ack must adapt.
- **In-flight signed segment URLs invalidate** when this change ships. The HMAC payload format changed (added `srcKind`), so any playlist generated before deploy with an open browser tab afterward 403s on segment fetch until the playlist is regenerated. Acceptable — preview playlists are session-scoped and refresh on reload.
- **Editor depends on Core for every stored-media drop.** Core unavailability surfaces as `EDITOR_PREVIEW_ITEM_REJECTED reason: "core unavailable"` on every add — there is no client-side cache, no retry. Operationally fine because Core is already in the critical path for any preview the editor renders.
- **Two correlation patterns in one message stream.** `requestId` (legacy preview items) and `mediaId` (stored media) coexist on response envelopes. Documented in `apps/frontend/CLAUDE.md` and `packages/contract/CLAUDE.md`.
- **iframe-demo simplifies** from two tabs (image, media) to one (media) with a single text input and preset chips matching every core-mock fixture id.
