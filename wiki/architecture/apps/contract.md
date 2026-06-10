# @video-editor/contract

חוזים משותפים לעורך הווידאו. סכמות Zod טהורות + טיפוסי TypeScript — אין קריאות רשת בזמן ריצה. כל טיפוס TS נגזר דרך `z.infer<typeof schema>` כך שסכמות וטיפוסים לעולם לא נסחפים.

## ארבעה Subpaths

| Subpath | כיוון / בעלים | מי מייבא |
|---|---|---|
| `@video-editor/contract/iframe/from-parent` | הורה **שולח** לעורך | אפליקציית הורה + frontend עורך |
| `@video-editor/contract/iframe/to-parent` | עורך **שולח** להורה | אפליקציית הורה + frontend עורך |
| `@video-editor/contract/events` | השרת **מפרסם** ל־RabbitMQ | כל מי שצורך אירועים |
| `@video-editor/contract/internal/<feature>` | סכמות HTTP API פנימיות של שרת העורך | **`apps/server` בלבד** — צוותים חיצוניים אסור לייבא |

`SavedMediaItem` / `SavedMediaPayload` מיוצאים מחדש משני `iframe/to-parent` ו־`events` (אותה צורה שמשמשת ב־`EDITOR_MEDIA_SAVED` וב־`export.started.data`). בחר בכל subpath שמתאים לקונטקסט שלך.

אין ייצוא שורש של `@video-editor/contract`. כל קורא מייבא subpath כך שהדלי שהוא נוגע בו מפורש.

## התקנה

```json
{ "dependencies": { "@video-editor/contract": "workspace:*" } }
```

## פרוטוקול Iframe

```
Parent page                       Editor iframe (at /editor/embed)
─────────────────────────────────────────────────────────────────
                                  ──EDITOR_READY──────────────────▶
◀── EDITOR_ADD_PREVIEW_ITEM ──────
         ─────────────── EDITOR_PREVIEW_ITEM_ADDED / EDITOR_PREVIEW_ITEM_REJECTED ──▶
◀── EDITOR_CLEAR_PROJECT ─────────
         ─────────────────────────────────── EDITOR_PROJECT_CLEARED ──▶
         ────────────────────────────────────── EDITOR_MEDIA_SAVED ──▶
```

### אמת הודעות נכנסות (הורה → עורך)

```ts
import { parentToEditorMessageSchema } from "@video-editor/contract/iframe/from-parent";

const result = parentToEditorMessageSchema.safeParse(event.data);
if (!result.success) return;
// result.data is fully typed
```

### בנה הודעות תגובה (עורך → הורה)

```ts
import {
  createPreviewItemAddedMessage,
  createPreviewItemRejectedMessage,
  createProjectClearedMessage,
  createMediaSavedMessage,
} from "@video-editor/contract/iframe/to-parent";

window.parent.postMessage(createPreviewItemAddedMessage(itemId), targetOrigin);
```

### `PreviewItemPayload` (נכנס)

Discriminated union לפי `kind`:

| `kind` | תיאור |
|---|---|
| `recording-range` | קטע הקלטה עם טווח זמן |
| `media` | asset מדיה גנרי |
| `audio-range` | קטע אודיו עם טווח זמן |

## אירועים

topic exchange יחיד `video-editor`. שלושה routing keys:

| Routing key | מטרה |
|---|---|
| `export.started` | job רינדור התחיל |
| `export.completed` | פלט רינדור הועלה |
| `export.failed` | job רינדור נכשל |

```ts
import {
  EXCHANGE_NAME,
  EXPORT_COMPLETED,
  exportCompletedEnvelopeSchema,
} from "@video-editor/contract/events";
```

ראה [`src/events/README.md`](src/events/README) למבנה מעטפת, AMQP headers, קישור תור, dead-lettering, גרסאות, הבטחות מסירה.

## פנימי (בעלי שרת בלבד)

```ts
import { designPayloadSchema } from "@video-editor/contract/internal/render";
import { editVideoRequestSchema } from "@video-editor/contract/internal/edit-video";
import { getSignedUrlRequestSchema } from "@video-editor/contract/internal/upload";
import { OverlayType, type TimeRange } from "@video-editor/contract/internal/shared";
```

צרכנים חיצוניים אסור לייבא `/internal/*`. ראה [ADR 0004](../adr/0004-server-http-schemas-in-shared-contract-package).

## מבנה מקור

```
src/
├── iframe/
│   ├── from-parent/        # Parent → editor (postMessage)
│   │   ├── __tests__/
│   │   ├── schemas.ts      # Zod + z.infer types
│   │   ├── helpers.ts
│   │   ├── mocks.ts
│   │   └── index.ts
│   └── to-parent/          # Editor → parent (postMessage)
│       ├── __tests__/
│       ├── schemas.ts
│       ├── helpers.ts
│       ├── mocks.ts
│       └── index.ts        # also re-exports SavedMedia* from ../shared
├── events/
│   ├── __tests__/
│   ├── envelope.ts
│   ├── export.ts
│   ├── mocks.ts
│   ├── README.md
│   └── index.ts            # also re-exports SavedMedia* from ../shared
├── shared/                 # internal-only — not in package.json exports
│   ├── __tests__/
│   └── saved-media.ts
└── internal/               # ⚠ server-owner only
    ├── upload/{schemas,index}.ts
    ├── edit-video/{schemas,index}.ts
    ├── render/{design-payload.schema,index}.ts
    ├── editor-export/{types,index}.ts
    └── shared/{overlay-type,time-range,video-metadata,index}.ts
```

## פקודות

```bash
pnpm build        # tsc -p tsconfig.json (required before test)
pnpm test         # pnpm build && node --test dist/**/*.test.js
pnpm type-check   # tsc -p tsconfig.json --noEmit
pnpm lint         # biome check .
pnpm format       # biome format . --write
```

## תלויות

- `zod` v4 — אימות בזמן ריצה. כל טיפוסי TS מגיעים מ־`z.infer<typeof schema>`.
