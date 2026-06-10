# ADR 0002 — Mock VOD כאפליקציה נפרדת (`apps/mock-vod`)

## סטטוס

התקבל — 2026-06-01.

## קונטקסט

הייצור רץ ברשת סגורה (air-gapped). pipeline ה־preview של video-editor תלוי בשני שירותי HTTP במעלה הזרם:

- **Core** — מנפיק `/private/channels/:id/play?start&end`, מחזיר `{ url, timeRanges, token }` כאשר `token` הוא `vod-token` קצר-מועד.
- **VOD** — משרת את מסמך ה־MPD ואת ה־DASH segments. מאמת את ה־`vod-token` בכל בקשה.

בייצור שני השירותים חולקים domain מאחורי reverse proxy. מנקודת המבט של שרת העורך הם נראים כיעד HTTP יחיד — אבל פנימית הם שני שירותים עם trust של token cross-service.

אף אחד מהם לא נגיש ממחשב מפתח. לפני ה־ADR הזה, ל־`apps/server` היו **שני** outbound adapters לאותו פורט:

- `HttpChannelPlayApiAdapter` — נתיב ייצור אמיתי; לא ניתן לבדיקה מקומית.
- `DemoChannelPlayApiAdapter` + route `/editor/demo-assets/*` בתוך השרת — קיצור דרך שדילג על זרימת ה־`vod-token` לחלוטין.

ה־branch של ה־demo התרחק מהייצור בשקט. באגים ששברו את הייצור (למשל החלטת `BaseURL`, header `vod-token` חסר, ההנחה של multi-range) עברו על demo.

## החלטה

חיקוי חוזה ה־HTTP האמיתי של VOD במעלה הזרם דרך **אפליקציית Fastify נפרדת** ב־`apps/mock-vod` (פורט 5050). ספרו עם `apps/core-mock` (פורט 8002), שעכשיו מטביע `vod-token`s אמיתיים ורושם אותם ב־`apps/mock-vod` דרך `POST /__internal/register-token` פנימי.

שרת העורך מריץ outbound adapter **אחד** (`HttpPreviewSourceAdapter`) מול גם ה־mocks וגם ייצור אמיתי. אין סניפי demo שורדים ב־`apps/server`.

## חלופות שנשקלו

1. **route demo בתוך השרת** (status quo שהחלפנו). נדחה — סוטה בשקט מהייצור.
2. **חבר את ה־VOD mock ל־`apps/core-mock`.** נדחה — מקפל את גבול cross-service שקיים בייצור. שני mocks לשני שירותים במעלה הזרם משמרים כל mock כן לחוזה האמיתי שלו.
3. **חקה את ה־reverse proxy של הייצור מקומית** (single-port frontage). נדחה — חלק נע נוסף, מסתיר את אותו trust cross-service שאנחנו רוצים להבליט.

## השלכות

חיוביות:
- נתיב קוד אחד מול mocks וייצור. באגים שמופיעים רק בייצור (החלטת BaseURL, multi-range, TTL של token) מופיעים מקומית.
- תיאום token cross-service (`/__internal/register-token`) משקף trust אמיתי של Core/VOD.
- ה־footgun של TTL של `vod-token` (playlists מאוחסנים ששורדים את ה־token שלהם) ניתן לשחזור במחשב פיתוח.

שליליות:
- תהליך זמן-פיתוח נוסף אחד. מצומצם על ידי Turborepo שמריץ אותו אוטומטית תחת `pnpm dev`.
- הגדרת טסטים מעט כבדה יותר: טסטי E2E מאתחלים את שני ה־mocks על פורטים ארעיים.
