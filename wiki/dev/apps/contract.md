# contract

`packages/contract` · מתפרסם כ-`@video-editor/contract`.

חוזים משותפים בין שרת העורך, ה-FE, אפליקציות הורה, וצרכני אירועים. סכמות Zod טהורות + טיפוסי TypeScript — בלי קריאות רשת בזמן ריצה. כל טיפוס TS = `z.infer<typeof schema>`, כך שסכמות וטיפוסים לא נסחפים.

גרסה נוכחית: **0.2.0**. הקפיצה מ-0.1.0 התרחשה ב-[ADR 0007](../adr-index) — payload-יי `image` ו-`media` הוסרו מ-`EDITOR_ADD_PREVIEW_ITEM` והוחלפו ב-`EDITOR_ADD_MEDIA { mediaId }`.

## ארבעה subpaths

| Subpath | כיוון / בעלים | מי מייבא |
|---|---|---|
| `@video-editor/contract/iframe/from-parent` | הורה → עורך | אפליקציית הורה + FE עורך |
| `@video-editor/contract/iframe/to-parent` | עורך → הורה | אפליקציית הורה + FE עורך |
| `@video-editor/contract/events` | שרת → RabbitMQ | צרכני אירועים חיצוניים |
| `@video-editor/contract/internal/<feature>` | HTTP פנים-שרת | **`apps/server` בלבד** |

אין ייצוא שורש — כל קורא חייב לבחור subpath. ה-bucket שהוא נוגע מפורש מ-ה-import.

`SavedMediaItem` / `SavedMediaPayload` ב-`shared/saved-media.ts`, מיוצאים מחדש מ-`iframe/to-parent` ו-`events` (אותה צורה ב-`EDITOR_MEDIA_SAVED` וב-`export.started.data`).

## התקנה

צרכן חיצוני:
```bash
pnpm add @video-editor/contract@<version>
```

נעל גרסה. החבילה מתפרסמת ל-registry פנימי — התקן כמו כל תלות פנימית. **אסור לשכפל את המאגר הזה.**

בתוך ה-workspace (`apps/server`, `apps/frontend`):
```json
{ "dependencies": { "@video-editor/contract": "workspace:*" } }
```

## iframe — from-parent

שלוש הודעות. ה-schema הסופי ב-`packages/contract/src/iframe/from-parent/schemas.ts`.

**`EDITOR_ADD_PREVIEW_ITEM { type, requestId?, payload }`** — discriminated union לפי `payload.kind`:
- `recording-range` — חלון מהקלטת ערוץ. `channelId, startTimeMs, endTimeMs, durationMs`.
- `audio-range` — מקטע אודיו. `audioId, durationMs, playback`.

**`EDITOR_ADD_MEDIA { type, mediaId }`** — מדיה מאוחסנת. העורך פותר את הסוג דרך Core. ראה [ADR 0007](../adr-index).

**`EDITOR_CLEAR_PROJECT { type, requestId? }`** — איפוס.

## iframe — to-parent

חמש הודעות. ה-schema ב-`packages/contract/src/iframe/to-parent/schemas.ts`.

- `EDITOR_READY` — אחרי אתחול ה-iframe.
- `EDITOR_PREVIEW_ITEM_ADDED { requestId?, mediaId?, itemId }` — ack לתוספת פריט.
- `EDITOR_PREVIEW_ITEM_REJECTED { requestId?, mediaId?, reason }` — nack.
- `EDITOR_PROJECT_CLEARED { requestId? }` — ack לניקוי.
- `EDITOR_MEDIA_SAVED { url, ...SavedMediaPayload }` — אחרי שייצוא נשמר. payload זהה ל-`export.started.data`.

קורלציה: `requestId` ל-recording/audio range ול-clear; `mediaId` ל-`EDITOR_ADD_MEDIA`. שתי תבניות במקביל בכוונה.

לפירוט פרוטוקול: [integrate/iframe](../../integrate/iframe).

## events

topic exchange יחיד `video-editor`. שלושה routing keys:

| Routing key | מטרה |
|---|---|
| `export.started` | רינדור התחיל (לפני FFmpeg). **at-least-once** — dedupe על `data.jobId`. |
| `export.completed` | פלט הועלה. `data.url` חתום. |
| `export.failed` | רינדור נכשל. `data.error` מחרוזת. |

מבנה המעטפת המלא + headers + ערובות: [integrate/events](../../integrate/events).

## internal — server-owner בלבד

```ts
import { designPayloadSchema } from "@video-editor/contract/internal/render";
import { editVideoRequestSchema } from "@video-editor/contract/internal/edit-video";
import { getSignedUrlRequestSchema } from "@video-editor/contract/internal/upload";
import { OverlayType, type TimeRange } from "@video-editor/contract/internal/shared";
```

צרכנים חיצוניים אסורים. ראה [ADR 0004](../adr-index).

## מבנה מקור

```
src/
├── iframe/
│   ├── from-parent/   # Parent → editor
│   └── to-parent/     # Editor → parent (גם re-export של SavedMedia*)
├── events/            # AMQP envelopes (גם re-export של SavedMedia*)
├── shared/            # פנימי — לא ב-exports של package.json
│   └── saved-media.ts
└── internal/          # ⚠ server-owner בלבד
    ├── upload/
    ├── edit-video/
    ├── render/
    ├── editor-export/
    └── shared/
```

כל subdir מחזיק `schemas.ts`, `helpers.ts` (אם רלוונטי), `mocks.ts`, `__tests__/`, `index.ts`.

## פקודות

```bash
pnpm build        # tsc -p tsconfig.json (חובה לפני test)
pnpm test         # pnpm build && node --test dist/**/*.test.js
pnpm type-check   # tsc -p tsconfig.json --noEmit
pnpm lint         # biome check .
pnpm format       # biome format . --write
```

## תלויות

- `zod` v4 — אימות runtime. כל טיפוסי TS מ-`z.infer`.

## מקורות

- `packages/contract/README.md`
- [packages/contract/CLAUDE.md](https://github.com/Zetro-Crew/video-editor/blob/main/packages/contract/CLAUDE.md)
- [packages/contract/src/events/README.md](https://github.com/Zetro-Crew/video-editor/blob/main/packages/contract/src/events/README.md) — onboarding לצרכני אירועים
