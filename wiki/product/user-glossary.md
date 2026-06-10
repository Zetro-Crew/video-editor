# User Glossary

Everyday vocabulary used in and around the editor. One sentence each. Engineering glossary with implementation detail: [architecture/glossary](../architecture/glossary).

## Project

The thing a user is editing — the canvas, the tracks, the clips arranged on them, and the export settings. Clearing the project resets the editor to a blank canvas.

## Track

A horizontal lane on the timeline. Tracks stack on top of each other; higher tracks render on top of lower tracks at the same time. Like layers in a paint program, but time goes left-to-right.

## Track Item (or Clip)

A single piece of content on a track — a chunk of video, an image, a text overlay, a shape, an audio segment. Each track item has a start time, a duration, and the source it points at.

## Recording

A long-running capture of a channel — for example, "everything that aired on Channel 42 yesterday". The editor doesn't show the whole recording; it shows the slice (the recording range) the user asks for.

## Recording Range

A specific time window of a recording — for example, "from 9:00:00 to 9:05:00 on yesterday's Channel 42 recording". This is the most common way content lands on the timeline.

## Channel

A logical content stream the host application knows about — managed by the platform, owned by units or teams. The editor consumes recordings from channels but does not manage them.

## Preview

The live playback in the editor window. The preview always reflects the current state of the timeline. It is not the same as the final exported file — the export is rendered separately.

## Export

The act of producing the final video file from the project. The user clicks export, the server renders the timeline, and the result is delivered to the destinations the user picked.

## Export Type

The format of the export. The two options today are:
- **MP4** — a standard video file most viewers can play.
- **WebP** — an animated image format. Smaller and useful for short clips like previews, thumbnails, or promo loops.

## Render

The behind-the-scenes work of turning the project into the final file. Users don't trigger renders directly; clicking export starts one. Renders can take seconds or minutes depending on length.

## Save Destinations

What the user chooses at export time:
- **Download to computer** — the file is offered as a browser download.
- **Save to personal channel** — the output goes to the user's own channel inside the host platform.
- **Save to unit channels** — the user picks one or more unit channels (team channels) to publish the output to.

Choices are not mutually exclusive — a user can download *and* publish to channels at the same time.

## Iframe Embed

The way the editor appears inside other apps. The editor lives at a single URL; any compatible host page can show it as a panel, a modal, or a full screen by loading that URL in an iframe.

## Personal Channel

Each user's own private channel. Used as a save destination at export time.

## Unit Channel

A team or group channel inside the host platform. Used as a save destination at export time.

## Token (VOD token, ztube-token)

Behind the scenes the editor uses short-lived credentials to fetch media from internal services. Users never see them; if a token expires mid-session, the editor automatically refreshes the underlying request. (If you're hitting expired-token errors as a developer, see [ops/runbooks](../ops/runbooks).)
