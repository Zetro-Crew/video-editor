# מילון Domain

> מאגר חד-קונטקסטי. ראה `docs/adr/` להחלטות ארכיטקטוניות.

## אימות סכמת HTTP

Zod היא ספריית האימות היחידה הן ל־env config והן לסכמות בקשות HTTP. TypeBox לא בשימוש. הסקת טיפוסים משתמשת ב־`z.infer<typeof schema>`.

→ ראה [ADR 0001](adr/0001-zod-over-typebox)

## דליי חבילת Contract

`@video-editor/contract` חושפת ארבעה subpaths מפורשים כך שצוותים חיצוניים יכולים לראות מה שלהם מול מה ששייך לצוות העורך:

**from-parent** — postMessage של אפליקציית הורה → עורך (`EDITOR_ADD_PREVIEW_ITEM`, `EDITOR_CLEAR_PROJECT`). Subpath: `@video-editor/contract/iframe/from-parent`.

**to-parent** — postMessage של עורך → הורה (`EDITOR_PREVIEW_ITEM_ADDED`, `EDITOR_PREVIEW_ITEM_REJECTED`, `EDITOR_PROJECT_CLEARED`, `EDITOR_READY`, `EDITOR_MEDIA_SAVED`). Subpath: `@video-editor/contract/iframe/to-parent`.

**events** — השרת מפרסם ל־topic exchange של `video-editor` (`export.started`, `export.completed`, `export.failed`). Subpath: `@video-editor/contract/events`.

**internal** — סכמות HTTP API פנימיות של שרת העורך (upload, edit-video, render, editor-export). Subpath: `@video-editor/contract/internal/<feature>`. צוותים חיצוניים אסור לייבא — ראה [ADR 0004](adr/0004-server-http-schemas-in-shared-contract-package).

כל טיפוס TS בחבילה הוא `z.infer<typeof schema>` כך שסכמות וטיפוסים לא יכולים להיסחף.

## הודעות (Messaging)

**Publish** — השרת מוסר מעטפת אירוע ל־broker על topic exchange של `video-editor`. נחשב להצלחה רק כשה־broker מאשר אותו (publisher confirms). publish שה־broker לעולם לא עושה לו ack, או שה־broker מחזיר כ־unrouted, הוא כשל שהשרת חייב לרשום ולמדוד.

**Unrouted** — ה־broker קיבל את ההודעה אבל אין תור קשור ל־routing key מתאים. מופיע כ־return כשמפרסמים עם `mandatory: true`. מטופל ככשל publish בצד השרת.

**Broker Ack** — האישור של ה־broker שהוא קיבל (וניתב) את ההודעה. האחריות של השרת מסתיימת כאן. האם צרכן בסופו של דבר יעבד את ההודעה היא דאגה של הצוות הצורך, לא של השרת.

**Event Envelope** — עטיפה ממוספרת סביב ה־payload של ה־domain: `{ eventName, eventVersion, occurredAt, traceparent, data }`. אותה צורה מוטבעת ב־AMQP headers (`x-event-name`, `x-event-version`) כך שמנויים יכולים לסנן בלי לפרסר את הגוף.

**Broker TLS** — broker של רשת סגורה משתמש ב־TLS הדדי של לקוח. סכמת `QUEUE_URL` מניעה את ההתנהגות: `amqps://` (ייצור) → התהליך קורא שלושה קבצי PEM באתחול מנתיבים קשיחים (`/bundle.pem` ל־CA הפרטי, `/tmp/certificates/rabbitmq/rabbit_cert.pem` + `rabbit_key.pem` לזהות הלקוח) ומעביר אותם כ־socket options לכל `amqplib.connect()`. `amqp://` (פיתוח) → חיבור פשוט, אין קריאת קבצים. ה־URL לא נושא userinfo בייצור — ה־broker מאמת לקוחות לפי תעודה.

## הרכבת העורך

**IDesign** — state עורך מסוריאל: tracks, track items, גודל canvas, FPS. זה ה־payload שה־frontend שולח ל־`/render`. זה המקור היחיד של אמת לאיך הפלט המרונדר ייראה.

**Render Job** — job אסינכרוני בצד שרת (מקודד לפי `jobId` ב־Redis) שמריץ FFmpeg מול IDesign ומאחסן את הפלט המקודד ב־S3. מצבים: `PROCESSING → COMPLETED | FAILED | CANCELLED`. ה־frontend עושה poll ל־`GET /render?id=<jobId>`.

**Edit-Video Job** — job FFmpeg אסינכרוני נפרד (גם נעקב ב־Redis) שמעבד קובץ מקור גולמי — לא IDesign מלא. בשימוש לחיתוך, גזירה והמרת פורמט של מקור יחיד. מצבים: `PROCESSING → COMPLETED | FAILED`.

## Pipeline רינדור

**Render Worker** — Deployment נפרד של `video-editor-worker`, אותו image כמו ה־API, entrypoint `apps/server/src/worker.ts`. צורך `render.requested` ומריץ FFmpeg. Probe + מטריקות על פורט 8081. ראה [ADR 0005](adr/0005-render-worker-deployment).

**Render Command** — הודעת AMQP פנימית שמפורסמת על ידי `POST /render` ל־direct exchange `video-editor.commands` עם routing key `render.requested`. המעטפת עוטפת את כל קלט הרינדור (sources, overlays, audio, format, `saveMetadata` אופציונלי). פנימי לשרת — לא חלק מהמשטח הציבורי של `@video-editor/contract`.

**תור render.requested** — quorum, durable, `x-delivery-limit=5`, `x-overflow=reject-publish`, `x-max-length=10000`. quorum + מונה מסירה לכל הודעה הוא מה שגורם ל־retry בצד ה־broker לעבוד בלי שהשרת יעקוב אחרי ניסיונות.

**Dead-Letter Queue** — `render.dead`, קשור ל־DLX `video-editor.commands.dlx`. מקבל הודעות שמספר המסירות שלהן עובר את `x-delivery-limit`. צרכן ש־co-located בתהליך ה־worker קורא אותו ומפרסם `export.failed { error: "max retries exceeded" }` סופי, כך שמנויים תמיד רואים אירוע סופי לכל `jobId` שעזב את ה־API.

**Command publish failure** — `publishCommand` עושה retry 3 פעמים עם backoff וסבב confirm-timeout לכל ניסיון. לאחר מיצוי ה־controller מחזיר 503 (לא ההתנהגות swallow-on-exhaustion שמשמשת לאירועים יוצאים) — הלקוח חייב לדעת שההכנסה לתור נכשלה.

**Idempotent re-delivery** — ה־worker גוזר מפתח פלט S3 דטרמיניסטי מ־`jobId`. אם `storage.exists(outputKey)` הוא true בעת הצריכה, הוא מפרסם `export.completed` עם ה־URL הקיים ועושה ack בלי להריץ מחדש את FFmpeg. מגן מפני SIGKILL של worker בין העלאה ל־ack.

## Preview & VOD

**Core Service** — שירות HTTP חיצוני שמארח את `/private/users/me`, רשימת ערוצים ו־`/private/channels/:id/play`. מומק מקומית על ידי `apps/core-mock` (פורט 8002).

**VOD Service** — שירות HTTP חיצוני שמארח MPD-generate + הזרמת DASH segments. מומק מקומית על ידי `apps/mock-vod` (פורט 5050). בייצור, Core ו־VOD חולקים domain מאחורי reverse proxy; מקומית הם שני פורטים נפרדים.

**Mock VOD** — `apps/mock-vod`. אפליקציית Fastify שמחקה את חוזה ה־HTTP האמיתי של VOD (manifest + segments + אימות `vod-token`). שרת העורך מריץ את אותו נתיב קוד מול Mock VOD ו־VOD אמיתי — אין סניפי demo ב־`apps/server`.

**Channel Play API** — `GET /private/channels/:id/play?start&end` ב־Core. מחזיר `{ url, timeRanges, token }`:
- `url` — URL מסמך MPD. יחסי בייצור (נפתר מול `CORE_BASE_URL`), מוחלט בפיתוח (mock VOD חי על פורט אחר מ־mock Core).
- `timeRanges[0][0]` — עוגן wall-clock (מילישניות) ל־segment הראשון (`segmentStartTimeMs`). ה־pipeline של HLS משתמש בזה, **לא** ב־`presentationTimeOffset` של MPD.
- `token` — VOD Token.

**VOD Token** — credential קצר-מועד (~10 דקות) שמופק על ידי Channel Play API של Core ומאומת על ידי VOD הן ב־MPD-generate והן ב־fetches של segment. Trust cross-service: בייצור, Core ו־VOD חולקים state פנימית; ב־mocks, `apps/core-mock` עושה POST ל־`/__internal/register-token` של `apps/mock-vod`. **Footgun:** ה־token נצרב לתוך URLs של preview playlist, כך ש־playlist מאוחסן שורד מעבר ל־token שלו — השהיה/idle מעבר ל־TTL ו־segments מקבלים 401.

**MPD Base** — URL בסיס אפקטיבי להחלטת תבניות segment של DASH. לפי ISO/IEC 23009-1, מחושב כ־`resolve(periodBaseURL, resolve(mpdBaseURL, mpdDocumentURL))` (RFC3986). `segmentStartTimeMs` (מ־`/play.timeRanges[0][0]`) הוא עוגן ה־wall-clock; `presentationTimeOffset` מה־MPD הוא מידעי בלבד ב־pipeline HLS הזה.

**Channel Range** — סוג מקור preview (`{ type: "channel-range", channelId, startTimeMs, endTimeMs }`) שמפנה לחלון זמן של הקלטת ערוץ חי. השרת פותר אותו על ידי קריאה ל־Channel Play API של Core, משיכת ה־DASH MPD והרכבת HLS Playlist. העורך תמיד עובד עם ה־HLS Playlist הפתור, לעולם לא ישירות עם ה־Channel Range.

**HLS Playlist** — קובץ `.m3u8` שמורכב בצד השרת שנבנה מ־DASH MPD. לא פורמט הקלטה מקורי — שרת העורך מסנתז אותו כך שמערך ה־HLS של הדפדפן יכול לנגן תוכן ממקור DASH בלי צורך ב־MSE/DASH.js. מאוחסן ב־S3 לאחר ההרכבה; ה־URL חתום.

**Segment Proxy** — endpoint `GET /editor/segment`. דפדפנים לא יכולים לצרף `vod-token` headers מותאמים אישית ל־fetches של segment מדיה (HLS). השרת פועל כ־proxy: הוא מאמת את ה־URL החתום ב־HMAC, מזריק את ה־`vod-token` header ומזרים את ה־bytes מ־VOD לדפדפן.

→ ראה [ADR 0002](adr/0002-mock-vod-as-separate-app)
