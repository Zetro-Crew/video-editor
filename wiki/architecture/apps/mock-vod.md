# @video-editor/mock-vod

שירות VOD mock עבור monorepo של video-editor. מחקה את חוזה ה־HTTP של VOD במעלה הזרם (MPD-generate + הזרמת DASH segments + אימות `vod-token`) כך ש־pipeline ה־preview של `apps/server` יכול לרוץ מקומית מול אותו נתיב קוד מדויק כמו בייצור.

פורט: **5050** (ברירת מחדל). מותאם עם `apps/core-mock` (8002).

ראה [CLAUDE.md](./) ל־routes, מבנה והערת ה־footgun של TTL.
