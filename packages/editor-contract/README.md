# editor-contract — `@video-editor/iframe-contract`

Shared postMessage protocol for the video editor's iframe integration. Provides Zod schemas, TypeScript types, and factory functions for typed communication between the editor iframe and any host page.

## Installation

This package is a workspace dependency. In the monorepo, reference it directly:

```json
{
  "dependencies": {
    "@video-editor/iframe-contract": "workspace:*"
  }
}
```

## Commands

```bash
pnpm build        # tsc (required before running tests)
pnpm test         # pnpm build && node --test dist/**/*.test.js
pnpm type-check   # tsc --noEmit
pnpm lint         # Biome check
pnpm format       # Biome format
```

## Protocol Overview

```
Host page                        Editor iframe (at /editor/embed)
─────────────────────────────────────────────────────────────────
                                 ──EDITOR_READY──────────────────▶
◀── EDITOR_ADD_PREVIEW_ITEM ─────
         ─────────────── preview_item_added / preview_item_rejected ──▶
◀── EDITOR_CLEAR_PROJECT ────────
         ─────────────────────────────────── project_cleared ──────▶
```

## API

### Schemas

```ts
import { parentToEditorMessageSchema } from '@video-editor/iframe-contract';

// Validates messages received by the editor
const message = parentToEditorMessageSchema.parse(event.data);
```

### Types

```ts
import type {
  ParentToEditorMessage,
  EditorToParentMessage,
  PreviewItemPayload,
  EditorReadyMessage,
} from '@video-editor/iframe-contract';
```

`PreviewItemPayload` is a discriminated union of three shapes:

| `kind` | Description |
|---|---|
| `recording-range` | A recording segment with time range |
| `media` | A generic media asset |
| `audio-range` | An audio segment with time range |

### Factory Functions

```ts
import {
  createPreviewItemAddedMessage,
  createPreviewItemRejectedMessage,
  createProjectClearedMessage,
} from '@video-editor/iframe-contract';

// Build typed response messages to send from the editor back to the host
const response = createPreviewItemAddedMessage({ ... });
window.parent.postMessage(response, targetOrigin);
```

### Mock Fixtures

```ts
import { ... } from '@video-editor/iframe-contract/mocks';
```

Available as a separate export to keep test helpers out of production bundles.

## Source Structure

```
src/
├── index.ts         # Main export
├── messages.ts      # Message type definitions
├── payloads.ts      # Payload interfaces
├── schemas.ts       # Zod validation schemas
├── helpers.ts       # Factory functions
├── helpers.test.ts  # Test suite
└── mocks.ts         # Mock fixtures
```

## Package Exports

```json
{
  "exports": {
    ".":       "./dist/index.js",
    "./mocks": "./dist/mocks.js"
  }
}
```

`src/` is available directly for workspace consumers during development — no build step required for the monorepo.

## Dependencies

| Package | Purpose |
|---|---|
| `zod` v4 | Runtime schema validation and type inference |
