# editor-contract Package

> **Closed network deployment:** This package is consumed by apps running in air-gapped environments. It contains no runtime network calls — purely type definitions and Zod schemas.
>
> **Keep this file updated:** Update whenever message types, schemas, or exports change.

Published as `@video-editor/iframe-contract`. Defines Zod schemas and TypeScript types for the postMessage protocol between the editor iframe and its parent page.

## Commands

```bash
pnpm build        # tsc -p tsconfig.json (required before test)
pnpm test         # pnpm build && node --test dist/**/*.test.js
pnpm type-check   # tsc -p tsconfig.json --noEmit
pnpm lint         # biome check .
pnpm format       # biome format . --write
```

## Source Structure

```
src/
├── index.ts         # Main export
├── messages.ts      # Message type definitions
├── payloads.ts      # Payload interfaces
├── schemas.ts       # Zod validation schemas
├── helpers.ts       # Factory functions
├── helpers.test.ts  # Test suite
└── mocks.ts         # Mock fixtures for testing
```

## Key Exports

**Schemas:**
- `parentToEditorMessageSchema` — Zod schema for messages the editor receives

**Types:**
- `ParentToEditorMessage`, `EditorToParentMessage` and subtypes
- `PreviewItemPayload` — union of `recording-range`, `media`, `audio-range` payload shapes
- `EditorReadyMessage` (`type: "EDITOR_READY"`) — sent by editor to parent on init
- `EditorMediaSavedMessage` (`type: "EDITOR_MEDIA_SAVED"`) — sent after user confirms save form; includes `mediaName`, `downloadToComputer`, `saveToPersonalChannel`, `url`, `exportType`, `items`
- `SavedMediaItem` — discriminated union for items in the saved media (`image`, `clip`, `recording`, `audio`)

**Factories:**
- `createPreviewItemAddedMessage`
- `createPreviewItemRejectedMessage`
- `createProjectClearedMessage`
- `createMediaSavedMessage`

## Package Exports

```json
"exports": {
  ".":       "./dist/index.js",
  "./mocks": "./dist/mocks.js"
}
```

`src/` is used directly in dev via `exports` field — no separate build needed for workspace consumers.

## Dependencies

- `zod` v4 — runtime validation
