# סיור במאגר

מבנה ה-monorepo. נקודות כניסה לכל אפליקציה.

## תרשים

```
apps/
  frontend/    — Vite + React 19 + React Router v7 (port 3000)
  server/      — Fastify + Node.js (ports 4001 API / 8081 Worker)
  iframe-demo/ — Angular 21 harness לבדיקת iframe (port 8080)
  core-mock/   — Mock פיתוח של שירות Core (port 8002)
  mock-vod/    — Mock פיתוח של שירות VOD (port 5050)
packages/
  contract/    — @video-editor/contract — סכמות Zod ל-postMessage, אירועי AMQP, פנים-שרת
```

`core-mock` ו-`mock-vod` מתאמים דרך `POST /__internal/register-token` כך שמודל ה-trust של `vod-token` cross-service זהה לייצור. ראה [ADR 0002](adr-index).

## פירוט לכל אפליקציה

- [frontend](apps/frontend)
- [server](apps/server)
- [contract](apps/contract)
- [dev harness](apps/dev-harness) — iframe-demo, core-mock, mock-vod ביחד

## כללי מאגר

- Runtime של שרת: Node.js 22.18+. TypeScript רץ ישירות.
- pnpm לכל ניהול חבילות. `pnpm add` / `pnpm add -D`. בלי `npm`.
- imports עם `.ts` — לא `.js`.
- אסור `tsx`/`ts-node` להרצת אפליקציה רגילה.
- בדיקות לפני סיום prompt:
  ```bash
  pnpm lint
  turbo run type-check
  pnpm test
  pnpm knip
  ```

## פילוסופיית פיתוח

TDD: red → green → refactor. טסט אחד כל פעם, vertical slices. אסור לכתוב את כל הטסטים ואז את כל הקוד.

- כל טסט מאמת התנהגות דרך ממשק ציבורי. טסטים שורדים refactors פנימיים.
- בלי mocking של משתפי פעולה פנימיים. נתיב הקוד האמיתי.

## פריסת רשת סגורה

הייצור רץ ב-air-gap. אסור:
- קישורי CDN חיצוניים.
- קריאות API ציבוריות בזמן ריצה.
- משיכת חבילות בזמן ריצה — `pnpm install` רץ רק מול ה-registry הפנימי.

כל תלות חיצונית חייבת להיות self-hosted או מסופקת בתוך ה-image.

## מקורות

- [CLAUDE.md](https://github.com/Zetro-Crew/video-editor/blob/main/CLAUDE.md)
- [docs/architecture.md](https://github.com/Zetro-Crew/video-editor/blob/main/docs/architecture.md)
