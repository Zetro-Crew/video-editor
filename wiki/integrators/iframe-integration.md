# הטמעת iframe

הטמע את העורך בתוך אפליקציית ההורה שלך והפעל אותו דרך `postMessage`. כל מבני ההודעות נבדקים מול סכמות Zod מתוך `@video-editor/contract`.

## התקנה

```bash
pnpm add @video-editor/contract@<version>
```

נעל את הגרסה. החבילה מתפרסמת ל־registry הפנימי שלך — כמו כל ספרייה פנימית אחרת. **אל תשכפל את המאגר הזה כדי לצרוך אותה.**

Subpaths ציבוריים:

| Subpath | כיוון |
|---|---|
| `@video-editor/contract/iframe/from-parent` | הורה → עורך (אתה שולח) |
| `@video-editor/contract/iframe/to-parent` | עורך → הורה (אתה מקבל) |

> `@video-editor/contract/internal/*` הוא פרטי לשרת העורך. ייבוא ממנו מקוד מתממשק יישבר ללא הודעה מראש.

## הטמעה

הצב iframe שמצביע על נתיב ההטמעה של העורך:

```html
<iframe
  src="https://<editor-host>/editor/embed"
  allow="clipboard-read; clipboard-write; fullscreen"
  style="width: 100%; height: 100%; border: 0"
></iframe>
```

על העורך **להישרת** מאותו registrable domain כמו אפליקציית ההורה. ההזדהות מתבצעת באמצעות עוגיית `HttpOnly` (`ztube-token`) שהדפדפן מצרף אוטומטית בבקשות שרת same-origin. הטמעה cross-domain אינה נתמכת תחת התכנון הזה — ראה [ADR 0003](../architecture/adr/0003-iframe-auth-via-httponly-cookie).

## הגדרת origins מותרים של הורה (בצד העורך)

הגדר את `VITE_EDITOR_PARENT_ORIGINS` בפריסה של ה־frontend של העורך לרשימה מופרדת בפסיקים של origins של הורים שמותר להם לשלוח הודעות:

```bash
VITE_EDITOR_PARENT_ORIGINS=https://app.example.com,https://staging.example.com
```

לא מוגדר → ברירת מחדל היא `window.location.origin`.

## זרימת הודעות

```
Parent app                                Editor iframe (/editor/embed)
────────────────────────────────────────────────────────────────────────
                                          ←── EDITOR_READY ────────────
─── EDITOR_ADD_PREVIEW_ITEM ──→
                              EDITOR_PREVIEW_ITEM_ADDED / REJECTED ──→
─── EDITOR_CLEAR_PROJECT ────→
                              ←── EDITOR_PROJECT_CLEARED ─────────────
                              ←── EDITOR_MEDIA_SAVED (after export) ──
```

`EDITOR_READY` נורית פעם אחת באתחול ה־iframe. התייחס אליו כאל סיגנל "העורך מוכן לקבל הודעות".

## הודעות נכנסות — מה שאתה שולח

הסכמות נמצאות ב־`@video-editor/contract/iframe/from-parent`.

### `EDITOR_ADD_PREVIEW_ITEM`

הוסף track לציר הזמן של העורך. ה־payload הוא discriminated union לפי `kind`.

| `kind` | מקרה שימוש |
|---|---|
| `recording-range` | חלון זמן של הקלטת ערוץ מנוהל. העורך פותר אותו ל־HLS playlist דרך השרת. |
| `media` | URL מדיה שרירותי (mp4 או HLS). אתה מספק URL נגינה ישירות. |
| `audio-range` | מקטע אודיו עם טווח זמן. |

מעטפת משותפת:

```ts
import type { EditorAddPreviewItemMessage } from "@video-editor/contract/iframe/from-parent";

const message: EditorAddPreviewItemMessage = {
  type: "EDITOR_ADD_PREVIEW_ITEM",
  requestId: crypto.randomUUID(), // optional — echoed back on the response
  payload: { /* see kind below */ },
};

iframe.contentWindow!.postMessage(message, editorOrigin);
```

#### `kind: "recording-range"`

```ts
{
  kind: "recording-range",
  channelId: "channel-42",
  startTimeMs: 1717000000000,
  endTimeMs:   1717000300000,
  durationMs: 300000,             // max 1h
  // Optional. Omit to let the editor resolve via POST /editor/preview-source.
  playback: { kind: "hls", src: "https://…/playlist.m3u8" },
  sourceOffsetMs: 0,
  posterSrc: "https://…/poster.jpg",
  name: "Morning broadcast",
}
```

מגבלות (נאכפות על ידי הסכמה):
- `endTimeMs > startTimeMs`
- `durationMs ≤ 3 600 000` (1 שעה)
- `sourceOffsetMs ≤ durationMs`
- `playback.src` חייב להיות URL מסוג `http(s)`

#### `kind: "media"`

```ts
{
  kind: "media",
  mediaId: "asset-123",
  playback: { kind: "mp4", src: "https://…/video.mp4" }, // or kind: "hls"
  durationMs: 120000,             // optional
  posterSrc: "https://…/thumb.jpg",
  name: "Intro clip",
}
```

#### `kind: "audio-range"`

```ts
{
  kind: "audio-range",
  audioId: "track-9",
  startTimeMs: 0,
  endTimeMs: 30000,
  durationMs: 30000,
  playback: { kind: "audio", src: "https://…/music.m4a" }, // or kind: "hls"
  sourceOffsetMs: 0,
  name: "Background music",
}
```

אם `playback.kind !== "hls"`, ה־`src` חייב להסתיים בסיומת אודיו מוכרת (`.mp3`, `.wav`, `.m4a`, `.aac`, `.ogg`, `.m3u8`).

### `EDITOR_CLEAR_PROJECT`

נקה את כל ה־tracks ואפס את ציר הזמן.

```ts
{
  type: "EDITOR_CLEAR_PROJECT",
  requestId: crypto.randomUUID(), // optional — echoed back
}
```

## הודעות יוצאות — מה שאתה מקבל

הסכמות נמצאות ב־`@video-editor/contract/iframe/to-parent`. בדוק תמיד הודעות נכנסות לפני שאתה פועל לפיהן.

### `EDITOR_READY`

```ts
{ type: "EDITOR_READY" }
```

נורית פעם אחת אחרי שה־iframe סיים את האתחול. הכנס לתור כל שליחה ממתינה עד שתראה את ההודעה הזו.

### `EDITOR_PREVIEW_ITEM_ADDED`

אישור (ack) ל־`EDITOR_ADD_PREVIEW_ITEM`.

```ts
{
  type: "EDITOR_PREVIEW_ITEM_ADDED",
  requestId?: string,    // echoed from request, if you sent one
  itemId: "item-abc",    // the timeline item id
}
```

### `EDITOR_PREVIEW_ITEM_REJECTED`

דחייה (nack) ל־`EDITOR_ADD_PREVIEW_ITEM`.

```ts
{
  type: "EDITOR_PREVIEW_ITEM_REJECTED",
  requestId?: string,
  reason: "<human-readable error>",
}
```

### `EDITOR_PROJECT_CLEARED`

אישור (ack) ל־`EDITOR_CLEAR_PROJECT`.

### `EDITOR_MEDIA_SAVED`

נורית כשהמשתמש מייצא וידאו מרונדר. הרינדור עצמו מתרחש אסינכרונית בשרת; ההודעה הזו מאשרת להורה שהייצוא נשמר לפי הבחירות של המשתמש.

```ts
{
  type: "EDITOR_MEDIA_SAVED",
  url: "https://…/rendered.mp4",
  mediaId: "media-xyz",
  mediaName: "My Edit",
  downloadToComputer: false,
  saveToPersonalChannel: true,
  selectedUnitChannelIds: ["unit-1"],
  exportType: "mp4",        // or "webp"
  items: [...],             // savedMediaItemSchema[]
}
```

אם אתה גם נרשם לאירועי AMQP, אותו payload של `mediaId`/`mediaName`/`exportType`/`items` מופיע באירוע `export.started` תחת `data` — ראה [צרכני אירועים](event-consumers).

## דוגמה מלאה

גשר מלא בצד הורה עם `safeParse`:

```ts
import {
  editorAddPreviewItemMessageSchema,
  type EditorAddPreviewItemMessage,
} from "@video-editor/contract/iframe/from-parent";
import {
  editorToParentMessageSchema,
} from "@video-editor/contract/iframe/to-parent";

const editorOrigin = "https://editor.example.com";
const iframe = document.querySelector<HTMLIFrameElement>("iframe#editor")!;

// 1. Wait for EDITOR_READY before sending.
let ready = false;
const pending: EditorAddPreviewItemMessage[] = [];

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
      console.log("added", msg.itemId, "for requestId", msg.requestId);
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

function send(msg: EditorAddPreviewItemMessage) {
  const valid = editorAddPreviewItemMessageSchema.safeParse(msg);
  if (!valid.success) throw new Error("invalid outbound message");
  iframe.contentWindow!.postMessage(msg, editorOrigin);
}

// 2. Add a preview item once ready.
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

## הרצת harness במאגר הזה

`apps/iframe-demo` (Angular 21) הוא harness פיתוח לפרוטוקול הזה. הוא טוען את העורך ב־iframe נגרר, שולח `EDITOR_ADD_PREVIEW_ITEM` ו־`EDITOR_CLEAR_PROJECT`, ומציג גם את ה־payload היוצא וגם את התגובות. השתמש בו לאימות אינטראקטיבי של מבני ההודעות שלך. ראה [architecture/apps/iframe-demo](../architecture/apps/iframe-demo).

## הזדהות — הגרסה הקצרה

אתה **לא** שולח את ה־token של ההזדהות דרך `postMessage`. העורך והשרת שלו חולקים registrable domain (בייצור gateway מנתב את שניהם; בפיתוח Vite proxy עושה זאת). `fetch` של same-origin מתוך ה־iframe נושא את עוגיית `HttpOnly` בשם `ztube-token` אוטומטית. השרת קורא אותה מתוך header של `Cookie` הנכנס ומעביר אותה במעלה הזרם ל־Core. אפליקציית ההורה לעולם לא נוגעת ב־token.

ראה [ADR 0003](../architecture/adr/0003-iframe-auth-via-httponly-cookie) לרציונל.
