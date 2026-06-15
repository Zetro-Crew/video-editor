# הטמעת iframe

הטמעת העורך בתוך אפליקציית ההורה והפעלתו דרך `postMessage`. כל ההודעות מאומתות מול סכמות Zod ב-`@video-editor/contract`.

## התקנה

```bash
pnpm add @video-editor/contract@<version>
```

נעל גרסה. החבילה מתפרסמת ל-registry פנימי — התקן כמו כל תלות פנימית. **אסור לשכפל את המאגר.**

Subpaths ציבוריים:

| Subpath | כיוון |
|---|---|
| `@video-editor/contract/iframe/from-parent` | הורה → עורך (אתה שולח) |
| `@video-editor/contract/iframe/to-parent` | עורך → הורה (אתה מקבל) |

`@video-editor/contract/internal/*` פרטי לשרת העורך. ייבוא ממנו מקוד הורה ישבר ללא הודעה מראש.

## הטמעת ה-iframe

```html
<iframe
  src="https://<editor-host>/editor/embed"
  allow="clipboard-read; clipboard-write; fullscreen"
  style="width: 100%; height: 100%; border: 0"
></iframe>
```

העורך **חייב** להישרת מאותו registrable domain כמו ההורה. אימות דרך עוגיית `ztube-token` (HttpOnly) שהדפדפן מצרף ב-fetch של same-origin. הטמעה cross-domain לא נתמכת. ראה [ADR 0003](../dev/adr-index).

## הגדרת origins מותרים (בצד העורך)

```bash
VITE_EDITOR_PARENT_ORIGINS=https://app.example.com,https://staging.example.com
```

ברירת מחדל כשלא מוגדר: `window.location.origin`.

## זרימה

```
Parent app                                Editor iframe (/editor/embed)
────────────────────────────────────────────────────────────────────────
                                          ←── EDITOR_READY ────────────
─── EDITOR_ADD_PREVIEW_ITEM ──→
                              EDITOR_PREVIEW_ITEM_ADDED / REJECTED ──→
─── EDITOR_ADD_MEDIA ─────────→
                              EDITOR_PREVIEW_ITEM_ADDED / REJECTED ──→
─── EDITOR_CLEAR_PROJECT ────→
                              ←── EDITOR_PROJECT_CLEARED ─────────────
                              ←── EDITOR_MEDIA_SAVED (לאחר ייצוא) ───
```

`EDITOR_READY` נורה פעם אחת באתחול ה-iframe. הכנס לתור כל שליחה ממתינה עד שתראה אותו.

## הודעות נכנסות — מה שאתה שולח

הסכמות ב-`@video-editor/contract/iframe/from-parent`.

### `EDITOR_ADD_PREVIEW_ITEM`

טווח זמן על ציר הזמן. ה-`payload.kind` הוא אחד מ-`recording-range` או `audio-range`.

```ts
import type { EditorAddPreviewItemMessage } from "@video-editor/contract/iframe/from-parent";

const message: EditorAddPreviewItemMessage = {
  type: "EDITOR_ADD_PREVIEW_ITEM",
  requestId: crypto.randomUUID(),   // אופציונלי — מהדהד בתגובה
  payload: { /* recording-range או audio-range */ },
};

iframe.contentWindow!.postMessage(message, editorOrigin);
```

**`kind: "recording-range"`** — חלון מהקלטת ערוץ מנוהל:

```ts
{
  kind: "recording-range",
  channelId: "channel-42",
  startTimeMs: 1717000000000,
  endTimeMs:   1717000300000,
  durationMs: 300000,             // עד שעה
  playback: { kind: "hls", src: "https://…/playlist.m3u8" }, // אופציונלי — אם חסר, העורך פותר דרך POST /editor/preview-source
  sourceOffsetMs: 0,              // אופציונלי
  posterSrc: "https://…/poster.jpg",
  name: "Morning broadcast",
}
```

מגבלות: `endTimeMs > startTimeMs`, `durationMs ≤ 3 600 000`, `sourceOffsetMs ≤ durationMs`, `playback.src` חייב להיות `http(s)`.

**`kind: "audio-range"`** — מקטע אודיו:

```ts
{
  kind: "audio-range",
  audioId: "track-9",
  startTimeMs: 0,
  endTimeMs: 30000,
  durationMs: 30000,
  playback: { kind: "audio", src: "https://…/music.m4a" }, // או kind: "hls"
  sourceOffsetMs: 0,
  name: "Background music",
}
```

אם `playback.kind !== "hls"`, ה-`src` חייב להסתיים בסיומת אודיו מוכרת (`.mp3`, `.wav`, `.m4a`, `.aac`, `.ogg`, `.m3u8`).

### `EDITOR_ADD_MEDIA`

מדיה מאוחסנת — תמונה, screenshot, clip או upload — לפי `mediaId` בלבד. העורך פותר את הסוג דרך Core. ראה [ADR 0007](../dev/adr-index).

```ts
{
  type: "EDITOR_ADD_MEDIA",
  mediaId: "media-abc",
}
```

קורלציה: אין `requestId` — התגובה מהדהדת `mediaId` ב-`EDITOR_PREVIEW_ITEM_ADDED { mediaId, itemId }` או ב-`EDITOR_PREVIEW_ITEM_REJECTED { mediaId, reason }`.

ack אסינכרוני — סבב לקריאת Core. אם ההורה הניח ack סינכרוני ל-image (לפני 0.2.0), שנה כדי לטפל ב-rejection (`reason: "core unavailable"` או `"media not found"`).

### `EDITOR_CLEAR_PROJECT`

```ts
{
  type: "EDITOR_CLEAR_PROJECT",
  requestId: crypto.randomUUID(),
}
```

## הודעות יוצאות — מה שאתה מקבל

הסכמות ב-`@video-editor/contract/iframe/to-parent`. **אמת תמיד** הודעות נכנסות לפני פעולה.

| הודעה | תוכן |
|---|---|
| `EDITOR_READY` | `{ type }`. פעם אחת באתחול. |
| `EDITOR_PREVIEW_ITEM_ADDED` | `{ requestId?, mediaId?, itemId }`. ack ל-`ADD_PREVIEW_ITEM` או `ADD_MEDIA`. |
| `EDITOR_PREVIEW_ITEM_REJECTED` | `{ requestId?, mediaId?, reason }`. nack. |
| `EDITOR_PROJECT_CLEARED` | `{ requestId? }`. ack לניקוי. |
| `EDITOR_MEDIA_SAVED` | `{ url, mediaId, mediaName, downloadToComputer, saveToPersonalChannel, selectedUnitChannelIds, exportType, items }`. לאחר ייצוא. אותו payload כמו `export.started.data` ב-AMQP. |

## דוגמה מלאה — גשר הורה

```ts
import {
  parentToEditorMessageSchema,
  type EditorAddPreviewItemMessage,
  type EditorAddMediaMessage,
} from "@video-editor/contract/iframe/from-parent";
import { editorToParentMessageSchema } from "@video-editor/contract/iframe/to-parent";

const editorOrigin = "https://editor.example.com";
const iframe = document.querySelector<HTMLIFrameElement>("iframe#editor")!;

let ready = false;
const pending: (EditorAddPreviewItemMessage | EditorAddMediaMessage)[] = [];

window.addEventListener("message", (event) => {
  if (event.source !== iframe.contentWindow) return;
  if (event.origin !== editorOrigin) return;

  const parsed = editorToParentMessageSchema.safeParse(event.data);
  if (!parsed.success) return;

  const msg = parsed.data;
  switch (msg.type) {
    case "EDITOR_READY":
      ready = true;
      pending.splice(0).forEach(send);
      break;
    case "EDITOR_PREVIEW_ITEM_ADDED":
      console.log("added", msg.itemId, msg.requestId ?? msg.mediaId);
      break;
    case "EDITOR_PREVIEW_ITEM_REJECTED":
      console.warn("rejected", msg.reason);
      break;
    case "EDITOR_PROJECT_CLEARED":
      console.log("cleared");
      break;
    case "EDITOR_MEDIA_SAVED":
      console.log("export saved", msg.url, msg.mediaName);
      break;
  }
});

function send(msg: EditorAddPreviewItemMessage | EditorAddMediaMessage) {
  const valid = parentToEditorMessageSchema.safeParse(msg);
  if (!valid.success) throw new Error("invalid outbound message");
  iframe.contentWindow!.postMessage(msg, editorOrigin);
}

const message: EditorAddPreviewItemMessage = {
  type: "EDITOR_ADD_PREVIEW_ITEM",
  requestId: crypto.randomUUID(),
  payload: {
    kind: "recording-range",
    channelId: "channel-42",
    startTimeMs: Date.now() - 60_000,
    endTimeMs: Date.now(),
    durationMs: 60_000,
  },
};
if (ready) send(message);
else pending.push(message);
```

## הזדהות — הגרסה הקצרה

אסור לשלוח את ה-token דרך postMessage. העורך והשרת שלו חולקים registrable domain (בייצור gateway, בפיתוח Vite proxy). `fetch` של same-origin מתוך ה-iframe נושא את עוגיית `ztube-token` אוטומטית. השרת קורא אותה מ-header `Cookie` ומעביר ל-Core. ההורה לעולם לא נוגע ב-token. ראה [ADR 0003](../dev/adr-index).

## harness מקומי

`apps/iframe-demo` (Angular 21) הוא ה-harness של הפרוטוקול. שולח `EDITOR_ADD_PREVIEW_ITEM`, `EDITOR_ADD_MEDIA`, `EDITOR_CLEAR_PROJECT` ומציג תגובות. שימושי לאימות מבני ההודעות אינטראקטיבית. ראה [dev/apps/dev-harness](../dev/apps/dev-harness).

## מקורות

- [packages/contract](../dev/apps/contract)
- `packages/contract/src/iframe/from-parent/schemas.ts` — מקור האמת
- `packages/contract/src/iframe/to-parent/schemas.ts` — מקור האמת
