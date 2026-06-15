# Dev harness — iframe-demo, core-mock, mock-vod

שלוש אפליקציות פיתוח. **לא ייצור.** משמשות לבדיקת אינטגרציות מקומית בלי הצורך לחבר את שירותי הייצור.

## iframe-demo

`apps/iframe-demo` · Angular 21 standalone · פורט **8080**.

ה-harness של פרוטוקול ה-iframe. טוען את העורך ב-iframe צף, נגרר ובר-שינוי גודל, שולח לו הודעות `postMessage` ומציג תגובות.

### הרצה

העורך חייב לרוץ ב-`http://localhost:3000` קודם:

```bash
# מהשורש
pnpm dev
```

או רק את שתי האפליקציות:

```bash
cd apps/frontend && pnpm dev
cd apps/iframe-demo && pnpm dev
```

### מה דף ה-demo עושה

| פעולה | הודעה שנשלחת |
|---|---|
| הוספת recording range | `EDITOR_ADD_PREVIEW_ITEM { kind: "recording-range" }` |
| הוספת מדיה לפי id | `EDITOR_ADD_MEDIA { mediaId }` (preset chips מ-`core-mock`) |
| ניקוי הפרויקט | `EDITOR_CLEAR_PROJECT` |
| בדיקת תגובות | מציג payload יוצא ותגובה אחרונה |

### קבצים מרכזיים

| קובץ | מטרה |
|---|---|
| `src/app/pages/editor-page/editor-page.component.ts` | host של iframe, drag/resize, postMessage |
| `src/app/pages/media-page/media-page.component.ts` | דף מדיה משני |
| `src/app/services/editor-bridge.service.ts` | תור signal להזרקת פריטים בין דפים |
| `src/app/message-types.ts` | מראה טיפוס מקומי של `@video-editor/contract/iframe/*` |
| `src/environments/environment.ts` | הגדרת `editorUrl` |

### שינוי יעד העורך

```ts
// src/environments/environment.ts
export const environment = {
  editorUrl: 'http://localhost:3000/editor/embed',
};
```

הזדהות: עוגיית `ztube-token` (HttpOnly) לעולם לא נוסעת ב-postMessage. fetches של same-origin של ה-iframe מצרפים אותה אוטומטית. ראה [ADR 0003](../adr-index).

## core-mock

`apps/core-mock` · Fastify · פורט **8002**.

מחקה את חוזה ה-HTTP של שירות Core במעלה הזרם. שרת העורך רץ מול אותו נתיב קוד מקומית כמו בייצור.

### Routes

| Method | נתיב | מטרה |
|---|---|---|
| `GET` | `/private/users/me` | זהות משתמש מקודדת קשיח |
| `GET` | `/private/media/clip/managed-virtual-channels` | רשימת ערוצים מקודדת קשיח |
| `GET` | `/private/channels/:channelId/play?start&end` | מטביע `vod-token`, רושם אותו ב-`mock-vod`, מחזיר `{ url, timeRanges, token }` |
| `GET` | `/private/media/:id/watch` | מחזיר `{ type, name }` ל-`EDITOR_ADD_MEDIA` |
| `GET` | `/private/videos/:id/play` | מחזיר MPD URL ל-ClipVideo / UploadedVideo |

### תיאום עם mock-vod

`POST /__internal/register-token` ב-`mock-vod` נקרא בעת `mint` של `vod-token` ב-`core-mock`. כך ש-trust ה-token cross-service בפיתוח משקף את הקשר האמיתי בייצור. ראה [ADR 0002](../adr-index).

## mock-vod

`apps/mock-vod` · Fastify · פורט **5050**.

מחקה את חוזה ה-HTTP של שירות VOD: יצירת MPD, הזרמת DASH segments ואימות `vod-token` בכל בקשה. ה-pipeline של preview של `apps/server` רץ מולו ומול VOD ייצור באותו נתיב קוד.

### footgun — TTL של vod-token

`vod-token` תקף ~10 דקות. URLs של segments חתומים על ידי playlists ה-HLS המאוחסנים — playlist ששמור מעבר ל-TTL יתחיל להחזיר `401` על segments. ניתן לשחזור במחשב פיתוח: הותר preview פתוח, חזור 15 דקות אחר כך, segments נכשלים. הפתרון: ייצר playlist מחדש דרך `POST /editor/preview-source`.

## מקורות

- `apps/iframe-demo/README.md`
- `apps/core-mock/README.md` + [apps/core-mock/CLAUDE.md](https://github.com/Zetro-Crew/video-editor/blob/main/apps/core-mock/CLAUDE.md)
- `apps/mock-vod/README.md` + [apps/mock-vod/CLAUDE.md](https://github.com/Zetro-Crew/video-editor/blob/main/apps/mock-vod/CLAUDE.md)
