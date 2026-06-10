# Feature Overview

What the editor can do, in everyday language. Each feature links to where the engineering detail lives.

## Editing

### Multi-track timeline

The editor shows a horizontal timeline with multiple tracks stacked vertically — like a music sequencer for video. Users can drag clips around, line them up, layer them, and resize them. The timeline keeps everything in sync so the preview always shows the current arrangement.

→ Engineering deep-dive: [architecture/apps/frontend](../architecture/apps/frontend.md)

### Preview while you edit

A live preview window plays the composition at the current cursor position, frame-accurate. Users see exactly what the export will look like, without having to render first.

### Trim, cut, and rearrange

Standard editing moves: shorten a clip from either end, cut a clip into two, drag a clip earlier or later in time, move it to a different track. All of these update the preview instantly.

### Transitions and animations

Between two clips on the same track, users can insert a transition (fade, slide, etc.). Individual elements (text, shapes, images) can animate in and out.

### Text and shapes

The editor can overlay text and simple shapes on top of video. Used for captions, labels, lower-thirds, or simple branding marks.

### Crop and resize

A dedicated crop modal lets users tighten the framing on a single clip or image without affecting the original source.

## Sourcing content

### Add a recording range from a managed channel

The most common entry point in production. A parent application tells the editor "add a 5-minute window from channel X starting at this time", and the editor pulls that exact range from the company's recording library and drops it on the timeline.

→ Engineering: [integrators/iframe-integration](../integrators/iframe-integration.md), `EDITOR_ADD_PREVIEW_ITEM` with `kind: "recording-range"`.

### Upload a file

Users can upload their own video, image, or audio file directly from the browser (up to 500 MB per file). Uploads go straight to internal storage — they do not travel through the editor server.

### Add an arbitrary media URL

A parent application can hand the editor a direct media URL (mp4 or HLS) — useful for embedding clips that don't live in the managed channel system.

### Add an audio track

Music or voice-over from a separate audio source, attached to the timeline as its own track.

## Exporting

### Export to MP4 or animated WebP

When the user clicks export, the editor packages the timeline as an instruction set and sends it to the server. The server renders the final video using FFmpeg and stores the result.

### Choose where the output lands

At export time, the user picks: download to my computer, save to my personal channel, save to one or more unit channels — or any combination. The editor records the choice on the export job; downstream services act on it.

→ Engineering: [integrators/event-consumers](../integrators/event-consumers.md), `export.completed` event.

### Async by design

The export does **not** make the user wait. The export job runs in the background; the user can keep editing, navigate away, or close the tab. They learn when it's done via the parent application's notification surface (driven by AMQP events the server publishes).

## Integration

### Embed-anywhere

The editor lives at `/editor/embed` and any host application can embed it in an iframe. The host drives the editor with structured messages — "add this clip", "clear the project" — and receives structured responses back.

→ Engineering: [integrators/iframe-integration](../integrators/iframe-integration.md)

### Single sign-on via the host's cookie

Users do not log in again to use the editor. The host application's auth cookie is attached automatically to the editor's server calls. The editor never sees the token value; it just lets the browser do its thing.

→ Engineering: [ADR 0003](../architecture/adr/0003-iframe-auth-via-httponly-cookie.md)

### Notifications to downstream services

Other teams' services can subscribe to a message stream from the editor server: "export started", "export completed", "export failed". Each carries enough context (job id, media id, output URL) for the consuming team to take their next action — file the output, notify the user, update a workflow.

→ Engineering: [integrators/event-consumers](../integrators/event-consumers.md)

## What the editor does *not* do

- It does not store the final video long-term. Downstream services do that, triggered by the `export.completed` notification.
- It does not transcode or process content during preview — the preview is the original source streamed back through the editor server with a token attached.
- It does not provide accounts, permissions, or channel management. Those come from the host application.
