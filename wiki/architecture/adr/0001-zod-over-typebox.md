# ADR 0001: Zod כספריית האימות היחידה

**סטטוס:** התקבל
**תאריך:** 2026-05-23

## קונטקסט

השרת השתמש בשתי ספריות אימות במקביל:
- **Zod** — עבור env config (`src/config/env.ts`)
- **TypeBox** — עבור סכמות בקשה/תגובה של HTTP (2 תכונות, 15 סכמות)

שתיהן שירתו את אותה מטרה: אימות בזמן ריצה + הסקת טיפוסים של TypeScript.

## החלטה

איחוד על **Zod** לכל האימות. החלפת `@sinclair/typebox` ו־`@fastify/type-provider-typebox` ב־`fastify-type-provider-zod`.

## פשרות

| | TypeBox | Zod |
|--|---------|-----|
| פורמט סכמה | JSON Schema (תואם AJV) | קנייני |
| Interop של OpenAPI | מקורי | דורש המרה |
| הסקת TS | `Static<typeof schema>` | `z.infer<typeof schema>` |
| ביצועי אימות | AJV (מהיר יותר) | Zod (איטי יותר, זניח בקנה המידה הזה) |
| כבר קיים | לא (נוסף ל־HTTP בלבד) | כן (env config) |

הפלט JSON Schema של TypeBox היה חשוב אם השרת הזה היה צריך לייצר OpenAPI docs אוטומטית. הוא לא. ה־runtime הוא שרת עריכת וידאו ברשת סגורה, לא API ציבורי.

## השלכות

- תלות אחת במקום שתיים לאימות
- כל הסקת הטיפוסים דרך `z.infer<>`
- `fastify-type-provider-zod` מטפל באינטגרציה של Fastify v5 + Zod v4
- סכמות HTTP: `edit-video.schema.ts`, `upload.schema.ts`
