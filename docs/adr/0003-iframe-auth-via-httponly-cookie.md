# ADR 0003 — Iframe authenticates via browser-attached HttpOnly cookie

## Status

Accepted — 2026-06-01.

## Context

The editor is embedded as an iframe inside the parent host app (Angular). User auth in the host environment is represented by `ztube-token`, an **HttpOnly** cookie set by the host's auth flow on the registrable domain shared by host and editor.

The editor server makes upstream calls to Core (`/private/channels/:id/play`) that require this cookie. So the token has to reach the editor server on every preview request.

Earlier implementation: the Angular parent attempted `document.cookie.match(/ztube-token=…/)` and forwarded the value to the iframe via `EDITOR_SET_AUTH`. The iframe stored it in a ref and sent it on each request as `x-ztube-token`. The server read the header and forwarded as `Cookie: ztube-token=…` to Core.

This was broken in prod by definition: HttpOnly cookies are invisible to `document.cookie`. The parent always read an empty string and the server always received an empty token. It only worked in dev with a non-HttpOnly cookie.

## Decision

Drop all JavaScript handling of the token. The editor and its server are served from the same registrable domain (prod: gateway routes both; dev: vite proxies `/editor/*` from `localhost:3000` to `localhost:4001`). Same-origin `fetch` from the iframe carries the HttpOnly cookie automatically. The server reads `ztube-token` from the inbound `Cookie` header and `HttpPreviewSourceAdapter` forwards it as `Cookie: ztube-token=…` on the outbound Core call.

Concretely:

- `EDITOR_SET_AUTH` message, the `authTokenRef` in `useEditorPostMessage`, the `authToken` parameter on `resolvePreviewSource` / `addPreviewItemToEditor`, the `x-ztube-token` request header — all deleted.
- The Angular parent no longer reads or posts the cookie.
- Server controller reads `request.headers.cookie` and parses `ztube-token` inline (no `@fastify/cookie` dep added).

## Alternatives Considered

1. **Keep `EDITOR_SET_AUTH` but make the cookie non-HttpOnly.** Rejected — weakens XSS posture for no operational benefit, because same-domain deployment makes browser attachment trivial.
2. **Server-to-server token exchange (OAuth, signed introspection).** Rejected — adds an upstream dependency and a new credential store for a problem the browser already solves under same-domain hosting.
3. **`@fastify/cookie` plugin for parsing.** Rejected — one regex on `request.headers.cookie` suffices; adding a dep contradicts the closed-network "minimize external surface" posture.

## Consequences

- The editor server **must** be served on the same registrable domain as the parent host. Cross-domain embedding is out of scope under this design and would require a new auth scheme (e.g., short-lived bearer token minted by the host and posted in over a confirmed-origin channel).
- Local dev requires the vite proxy: any non-proxied fetch (e.g. directly to `http://localhost:4001`) is cross-origin and will not carry `localhost` cookies unless `credentials: 'include'` is set explicitly with CORS credentials configured server-side. The current setup uses `credentials: 'same-origin'` (the `fetch` default), which is sufficient via the proxy.
- The iframe contract surface shrinks (one fewer message type, one fewer schema).
- Token rotation, revocation, and storage become entirely the host's concern. The editor never touches the value.
