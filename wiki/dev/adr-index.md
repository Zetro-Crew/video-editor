# ADRs — אינדקס

החלטות ארכיטקטוניות. רשומות append-only — לאחר קבלה לא נערכות; החלפה היא רשומה חדשה. הקבצים המלאים באנגלית, בשורש המאגר תחת `docs/adr/`.

## 0001 — Zod כספריית האימות היחידה

**סטטוס:** התקבל · 2026-05-23

איחוד על Zod לכל האימות (env + HTTP). TypeBox הוסר. סיבה: hagasat טיפוסים יחידה דרך `z.infer<typeof schema>`. הפלט JSON Schema של TypeBox היה רלוונטי רק אם השרת היה מייצר OpenAPI אוטומטית — והוא לא; ה-runtime הוא שרת ברשת סגורה, לא API ציבורי.

מקור: [docs/adr/0001-zod-over-typebox.md](https://github.com/Zetro-Crew/video-editor/blob/main/docs/adr/0001-zod-over-typebox.md)

## 0002 — Mock VOD כאפליקציה נפרדת

**סטטוס:** התקבל · 2026-06-01

חיקוי חוזה VOD ב-`apps/mock-vod` נפרד (פורט 5050), מתואם עם `apps/core-mock` (8002). מבטל את ה-route של demo שדילג על זרימת `vod-token` ושנהג להתרחק מהייצור בשקט. שרת העורך מריץ adapter יחיד מול mocks ומול ייצור — באגים שמופיעים רק בייצור (BaseURL, TTL, multi-range) ניתנים לשחזור מקומית.

מקור: [docs/adr/0002-mock-vod-as-separate-app.md](https://github.com/Zetro-Crew/video-editor/blob/main/docs/adr/0002-mock-vod-as-separate-app.md)

## 0003 — אימות iframe דרך עוגיית HttpOnly

**סטטוס:** התקבל · 2026-06-01

ההורה לא נוגע ב-`ztube-token`. העורך והשרת שלו חולקים registrable domain (gateway בייצור, Vite proxy בפיתוח), כך שהדפדפן מצרף את עוגיית ה-HttpOnly אוטומטית ב-fetch של same-origin. המימוש הקודם (`document.cookie.match` ו-`EDITOR_SET_AUTH` ידני) היה שבור מהגדרה — עוגיות HttpOnly אינן נראות ל-JavaScript.

מקור: [docs/adr/0003-iframe-auth-via-httponly-cookie.md](https://github.com/Zetro-Crew/video-editor/blob/main/docs/adr/0003-iframe-auth-via-httponly-cookie.md)

## 0004 — סכמות HTTP של השרת חיות בחבילת ה-contract

**סטטוס:** התקבל · 2026-06-01

`/internal/<feature>` subpaths חדשים ב-`@video-editor/contract` מחזיקים סכמות HTTP פנימיות של השרת. צוות חיצוני רואה מ-import path מי בעלים. ה-FE וה-server חולקים `designPayloadSchema` וכו' ללא שכפול.

מקור: [docs/adr/0004-server-http-schemas-in-shared-contract-package.md](https://github.com/Zetro-Crew/video-editor/blob/main/docs/adr/0004-server-http-schemas-in-shared-contract-package.md)

## 0005 — רינדור על תור עמיד + Worker ייעודי

**סטטוס:** התקבל · 2026-06-02

`POST /render` מכניס פקודה ל-`render.requested` (quorum, durable, `x-delivery-limit=5`). Deployment נפרד של `video-editor-worker` (אותו image, entrypoint `src/worker.ts`) צורך ומריץ FFmpeg. אירועי `export.*` הם ערוץ התוצאה היחיד — Redis state נמחק לחלוטין, אין `GET /render`. Idempotency דרך מפתח פלט דטרמיניסטי מ-`jobId`.

מקור: [docs/adr/0005-render-worker-deployment.md](https://github.com/Zetro-Crew/video-editor/blob/main/docs/adr/0005-render-worker-deployment.md)

## 0006 — התאוששות חיבור מובנית של amqplib

**סטטוס:** התקבל · 2026-06-02

החלפת לולאות reconnect ידניות ב-`connect(url, { recovery })` של amqplib 1.1+. הצהרת טופולוגיה רצה ב-callback של `setup` כדי לרוץ מחדש בכל reconnect. Fail-fast באתחול נשמר דרך probe חיבור פשוט + `AMQP_INITIAL_CONNECT_TIMEOUT_MS`, כי `maxRetries: Infinity` לעולם לא דוחה את ה-promise הראשוני. `ChannelClosedError` דוחה publishes בטיסה.

מקור: [docs/adr/0006-amqplib-built-in-recovery.md](https://github.com/Zetro-Crew/video-editor/blob/main/docs/adr/0006-amqplib-built-in-recovery.md)

## 0007 — קליטת מדיה מאוחסנת ב-id בלבד

**סטטוס:** התקבל · 2026-06-14

הודעת postMessage חדשה — `EDITOR_ADD_MEDIA { mediaId }` — מחליפה את payload-יי `image` ו-`media` שהיו תחת `EDITOR_ADD_PREVIEW_ITEM`. העורך פותר את הסוג דרך `GET /private/media/:id/watch` של Core. תמונה/screenshot → `ADD_IMAGE` עם URL חתום. ClipVideo/UploadedVideo → preview-source חדש `{ type: "media-id" }` שבונה HLS דרך `/private/videos/:id/play`. `vod-token` **לא** מונפק — Core משרת segments תחת עוגיית session; ה-segment proxy חותם על `srcKind` ב-HMAC כדי לדעת איזה header להזריק. `@video-editor/contract` 0.1.0 → 0.2.0.

מקור: [docs/adr/0007-stored-media-id-only-intake.md](https://github.com/Zetro-Crew/video-editor/blob/main/docs/adr/0007-stored-media-id-only-intake.md)
