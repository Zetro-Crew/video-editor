# תהליך עבודה

איך הצוות עובד יום-יום.

## TDD

red → green → refactor. טסט אחד כל פעם, vertical slice.

- כותבים טסט אחד נכשל להתנהגות אחת. מימוש מינימלי שעובר. ממשיכים.
- טסטים בודקים התנהגות דרך ממשק ציבורי. שורדים refactors פנימיים.
- בלי mocking של משתפי פעולה פנימיים. נתיב הקוד האמיתי.

לפירוט: skill `/tdd`.

## בדיקות לפני push

```bash
pnpm lint
turbo run type-check
pnpm test
pnpm knip
```

ארבע חייבות לעבור.

## הרצה לכל אפליקציה

```bash
cd apps/frontend    && pnpm dev   # Vite, פורט 3000
cd apps/server      && pnpm dev   # Node --watch על src/index.ts, פורט 4001
cd apps/iframe-demo && pnpm dev   # Angular dev server, פורט 8080
```

`pnpm dev` מהשורש מריץ הכל במקביל דרך Turborepo.

## רשת סגורה

- אסור CDN ציבורי.
- אסור fetch בזמן ריצה ל-URL ציבורי.
- כל תלות צד שלישי — self-hosted או מסופקת ב-image.

## מקורות

- [CLAUDE.md](https://github.com/Zetro-Crew/video-editor/blob/main/CLAUDE.md)
