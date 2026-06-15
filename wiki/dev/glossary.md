# מילון מונחים

המונחים שחוזרים בקוד, ב-PRs ובדיונים. שתי קבוצות: מונחי UI שמופיעים בעורך ומול משתמשים, ומונחים טכניים שמופיעים בקוד ובהודעות.

## מונחי UI

**Project (פרויקט)** — מה שהמשתמש עורך: ה-canvas, ה-tracks וה-clips. ניקוי פרויקט (`EDITOR_CLEAR_PROJECT`) מאפס לעורך ריק.

**Track** — מסלול אופקי בציר הזמן. tracks גבוהים מרונדרים מעל tracks נמוכים באותו זמן.

**Track Item / Clip** — חתיכת תוכן יחידה על track: וידאו, תמונה, טקסט, צורה, אודיו. נושאת זמן התחלה, משך והמקור שאליו היא מצביעה.

**Recording** — לכידה ארוכת-טווח של ערוץ. העורך לא מציג את כל ההקלטה, רק את ה-recording range שהוקצב.

**Recording Range** — חלון זמן ספציפי של recording (`channelId + startTimeMs + endTimeMs`). הנתיב הנפוץ ביותר שתוכן נוחת על ציר הזמן.

**Channel (ערוץ)** — זרם תוכן לוגי שמנוהל על ידי אפליקציית ה-host. העורך צורך recordings מערוצים אבל לא מנהל אותם.

**Preview** — הנגינה החיה שמשקפת את מצב ציר הזמן הנוכחי. אינה הקובץ הסופי — הייצוא מרונדר בנפרד.

**Export / Render** — ייצור הקובץ הסופי. המשתמש לוחץ Export; השרת מרנדר. שני פורמטים: **MP4** ו-**WebP** (תמונה מונפשת).

**Save Destinations** — מה שהמשתמש בוחר בייצוא: הורדה למחשב, שמירה לערוץ אישי, שמירה לערוצי יחידה. הבחירות לא בלעדיות.

**Personal Channel** — הערוץ הפרטי של המשתמש בפלטפורמת ה-host.

**Unit Channel** — ערוץ צוות/קבוצה בפלטפורמת ה-host.

**iframe Embed** — האופן שהעורך מופיע בתוך אפליקציות אחרות. URL יחיד (`/editor/embed`) שכל host טוען ב-iframe.

## מונחים טכניים

### הרכבת העורך

**IDesign** — מצב העורך המסודר: tracks, items, גודל canvas, FPS. ה-payload שה-FE שולח ל-`POST /render`. המקור היחיד לאיך הפלט המרונדר ייראה.

**Render Job** — job אסינכרוני שמריץ FFmpeg על IDesign ושומר את הפלט ב-S3. מזוהה ב-`jobId`. מעקב דרך אירועי `export.*` ב-AMQP.

### הודעות (AMQP)

**Publish** — השרת מוסר מעטפת לאחד משני exchanges. הצלחה רק כשה-broker מאשר (publisher confirms). publish ללא ack או החזרה כ-unrouted = כשל.

**Unrouted** — broker קיבל את ההודעה אבל אין תור קשור ל-routing key. עם `mandatory: true` הוא מוחזר. נחשב כשל פרסום.

**Broker Ack** — אישור broker שההודעה נתקבלה ונותבה. אחריות השרת מסתיימת כאן.

**Event Envelope** — עטיפה ממוספרת סביב ה-payload של ה-domain: `{ eventName, eventVersion, occurredAt, traceparent?, data }`. אותם שדות גם ב-AMQP headers (`x-event-name`, `x-event-version`) כדי לסנן בלי לפרסר את הגוף.

**Broker TLS** — בייצור ה-broker רץ על `amqps://` עם mTLS. סכמת `QUEUE_URL` מניעה את ההתנהגות: `amqps://` → התהליך קורא `/bundle.pem` + `/tmp/certificates/rabbitmq/rabbit_{cert,key}.pem` באתחול. `amqp://` (פיתוח) → חיבור פשוט. ה-URL לא נושא userinfo בייצור — אימות דרך תעודה.

### Pipeline רינדור

**Render Worker** — Deployment נפרד של `video-editor-worker`. אותו image כמו ה-API, entrypoint `src/worker.ts`. צורך `render.requested`. ראה [ADR 0005](adr-index).

**Render Command** — הודעת AMQP פנימית שמפורסמת על ידי `POST /render` ל-`video-editor.commands` עם routing key `render.requested`. פנימי לשרת — לא חלק מהמשטח הציבורי של `@video-editor/contract`.

**תור `render.requested`** — quorum, durable, `x-delivery-limit=5`, `x-overflow=reject-publish`, `x-max-length=10000`. ה-quorum + מונה מסירה לכל הודעה הם מה שגורם ל-retry בצד ה-broker לעבוד בלי שהשרת יעקוב.

**DLQ (`render.dead`)** — קשור ל-`video-editor.commands.dlx`. הודעות שמיצו את `x-delivery-limit` נופלות לכאן. צרכן co-located ב-worker קורא ומפרסם `export.failed { error: "max retries exceeded" }` סופי, כדי שכל `jobId` תמיד יקבל אירוע סופי.

**Command publish failure** — `publishCommand` עושה 3 ניסיונות עם backoff וסבב confirm-timeout. לאחר מיצוי: `503` ללקוח (לא swallow — הלקוח חייב לדעת). פרסום אירועים יוצאים שונה: בלוע בשקט לאחר מיצוי + לוג.

**Idempotency** — ה-worker גוזר מפתח פלט S3 דטרמיניסטי מ-`jobId`. אם `storage.exists(outputKey)` בעת הצריכה, מפרסם `export.completed` עם ה-URL הקיים ועושה ack בלי FFmpeg. מגן מפני SIGKILL בין העלאה ל-ack.

### Preview & VOD

**Core Service** — שירות HTTP חיצוני: `/private/users/me`, רשימת ערוצים, `/private/channels/:id/play`, `/private/media/:id/watch`, `/private/videos/:id/play`. מומק מקומית ב-`apps/core-mock` (8002).

**VOD Service** — שירות HTTP חיצוני שמשרת DASH MPD ו-segments. מאמת `vod-token` בכל בקשה. מומק מקומית ב-`apps/mock-vod` (5050). בייצור Core ו-VOD חולקים domain מאחורי reverse proxy; בפיתוח שני פורטים נפרדים.

**Channel Play API** — `GET /private/channels/:id/play?start&end` ב-Core. מחזיר `{ url, timeRanges, token }`. `timeRanges[0][0]` הוא עוגן wall-clock ל-segment הראשון; הוא — לא `presentationTimeOffset` של MPD — מניע את ה-pipeline של HLS.

**VOD Token** — credential קצר-מועד (~10 דקות) שמופק על ידי Core ומאומת על ידי VOD. נצרב לתוך URLs של playlist. **Footgun:** playlists שמורים שורדים מעבר ל-TTL — segments מחזירים 401 לאחר השהיה. ייצור מחדש על ידי קריאה נוספת ל-`POST /editor/preview-source`.

**Channel Range** — מקור preview (`{ type: "channel-range", channelId, startTimeMs, endTimeMs }`) שמצביע לחלון מהקלטת ערוץ חי. השרת פותר דרך Core → VOD → HLS. העורך תמיד עובד עם ה-HLS playlist הפתור.

**Media-ID source** — מקור preview חדש (`{ type: "media-id", mediaId }`) ל-`EDITOR_ADD_MEDIA`. השרת קורא ל-Core (`/private/media/:id/watch`, `/private/videos/:id/play`) ובונה HLS. **לא** מנפיק `vod-token` — Core משרת segments תחת עוגיית session. ראה [ADR 0007](adr-index).

**HLS Playlist** — קובץ `.m3u8` שמורכב בצד השרת מ-DASH MPD. לא פורמט הקלטה מקורי — סינתזה כדי שמערך ה-HLS של הדפדפן ינגן תוכן DASH בלי MSE/DASH.js. מאוחסן ב-S3, ה-URL חתום.

**Segment Proxy** — endpoint `GET /editor/segment`. הדפדפן לא יכול לצרף `vod-token` ל-fetches של media segments. השרת פועל כ-proxy: מאמת HMAC, מזריק את ה-header הנכון (`vod-token` ל-channel-range; עוגיית session ל-media-id) ומזרים את ה-bytes.

### חבילת Contract

`@video-editor/contract` חושפת ארבעה subpaths:

- `iframe/from-parent` — postMessage הורה → עורך (`EDITOR_ADD_PREVIEW_ITEM`, `EDITOR_CLEAR_PROJECT`, `EDITOR_ADD_MEDIA`).
- `iframe/to-parent` — postMessage עורך → הורה (`EDITOR_READY`, `EDITOR_PREVIEW_ITEM_ADDED`, `EDITOR_PREVIEW_ITEM_REJECTED`, `EDITOR_PROJECT_CLEARED`, `EDITOR_MEDIA_SAVED`).
- `events` — מעטפות AMQP (`export.started`, `export.completed`, `export.failed`).
- `internal/<feature>` — סכמות HTTP פנימיות של שרת העורך. `apps/server` בלבד. צוותים חיצוניים אסורים. ראה [ADR 0004](adr-index).

כל טיפוס TS = `z.infer<typeof schema>` — בלי drift בין סכמה לטיפוס.

## מקורות

- `CONTEXT.md` בשורש המאגר
- [docs/adr/](https://github.com/Zetro-Crew/video-editor/tree/main/docs/adr)
- [packages/contract](apps/contract)
