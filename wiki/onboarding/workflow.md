# תהליך עבודה

איך הצוות עובד על המאגר הזה.

## פילוסופיית פיתוח

מעדיפים **TDD**: red → green → refactor. טסט אחד בכל פעם, vertical slices בלבד — לעולם לא לכתוב את כל הטסטים ואז את כל הקוד.

- כתוב טסט נכשל אחד להתנהגות אחת, הטמע את המינימום כדי לעבור, חזור.
- טסטים מאמתים התנהגות דרך ממשקים ציבוריים, לא פרטי מימוש. טסטים חייבים לשרוד refactors פנימיים.
- אין mocking של משתפי פעולה פנימיים. השתמש בנתיבי קוד אמיתיים.

## בדיקות נדרשות לפני push

```bash
pnpm lint
turbo run type-check
pnpm test
pnpm knip
```

כל ארבע חייבות לעבור.

## פקודות לכל אפליקציה

```bash
cd apps/frontend    && pnpm dev   # Vite dev server (3000)
cd apps/server      && pnpm dev   # Node --watch on src/index.ts (4001)
cd apps/iframe-demo && pnpm dev   # Angular dev server (8080)
```

## תזכורות לרשת סגורה

- אין קישורי CDN ציבוריים.
- אין משיכות בזמן ריצה ל־URLs ציבוריים.
- כל התלויות של צדדים שלישיים חייבות להיות self-hostable או מסופקות.
