# @video-editor/core-mock

שירות Core mock עבור monorepo של video-editor. מחקה את חוזה ה־HTTP של Core במעלה הזרם (זהות משתמש, רשימת ערוצים, Channel Play API) כך ש־`apps/server` יכול לרוץ מקומית מול אותו נתיב קוד שמשמש בייצור.

פורט: **8002** (ברירת מחדל). מותאם עם `apps/mock-vod` (5050) — מתאם דרך `POST /__internal/register-token` כך ש־cross-service trust של `vod-token` משקף את הקשר האמיתי של Core/VOD.

Routes:

| Method | נתיב | תיאור |
|---|---|---|
| GET | `/private/users/me` | זהות משתמש מקודדת קשיח |
| GET | `/private/media/clip/managed-virtual-channels` | רשימת ערוצים מקודדת קשיח |
| GET | `/private/channels/:channelId/play?start&end` | מטביע `vod-token`, רושם אותו ב־`apps/mock-vod`, מחזיר `{ url, timeRanges, token }` |

ראה [CLAUDE.md](./) ל־route shapes מלאים, פרטי trust cross-service, env vars ומבנה. ראה [ADR 0002](../adr/0002-mock-vod-as-separate-app) לרציונל התכנון.
