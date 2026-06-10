# 0004 — סכמות HTTP של השרת חיות בחבילת ה־contract המשותפת

- סטטוס: התקבל
- תאריך: 2026-06-01

## קונטקסט

`@video-editor/contract` משותפת עם צוות חיצוני (אפליקציית הורה) שמטמיע את ה־iframe של העורך. החבילה כבר מחזיקה:

- סכמות postMessage של iframe (הורה ↔ עורך)
- מעטפות אירועי AMQP (שרת → RabbitMQ)

`apps/server` החזיקה בעבר סכמות route HTTP משלה ליד כל תכונה (`features/<feature>/adapters/inbound/http/*.schema.ts`) בתוספת טיפוסי ערך ב־`shared/domain/` (`OverlayType`, `TimeRange`, `VideoMetadata`, barrel של `render-types`). זה עוקב אחרי הקונבנציה ההקסגונלית הרגילה "כל תכונה מחזיקה בסכמות שלה".

אבל:

1. צוותים חיצוניים שקראו את `@video-editor/contract` לא היו להם דרך לדעת מה "המשטח שלהם" מול של צוות העורך. כל מה שנגרר דרך grep נראה ציבורי באותה מידה.
2. ה־frontend של העורך ושרת העורך חולקים את אותן סכמות (`designPayloadSchema`, `editVideoRequestSchema` וכו') אבל היסטורית שכפלו או עשו copy-paste של הטיפוסים. מקור אמת יחיד היה חסר.
3. עובדים חדשים המשיכו לשאול "איפה אני מוצא את הטיפוס של X?". שלוש תשובות סבירות לכל תכונה.

## החלטה

העבר כל סכמת route HTTP וכל טיפוס ערך HTTP משותף מתוך `apps/server` אל `@video-editor/contract/internal/<feature>`. חבילת ה־contract הופכת ל**בית יחיד לכל חוזי הטיפוסים של צוות העורך**, מאורגנת לארבעה דליים מפורשים:

| דלי | Subpath | קהל יעד |
|---|---|---|
| הורה → עורך | `iframe/from-parent` | חיצוני + frontend עורך |
| עורך → הורה | `iframe/to-parent` | חיצוני + frontend עורך |
| אירועי RabbitMQ | `events` | צרכנים חיצוניים |
| HTTP של שרת העורך | `internal/<feature>` | **`apps/server` בלבד** |

צוותים חיצוניים יודעים מיד ש־`/internal/*` לא בשבילם.

כל טיפוסי TS בחבילה מגיעים מ־`z.infer<typeof schema>`.

## השלכות

**טוב**

- מקום אחד לחפש בו כל חוזה טיפוס בבעלות צוות העורך.
- צוותים חיצוניים לא יכולים להצטמד בטעות ל־`/internal/*` — שם ה־subpath הוא האזהרה.
- `apps/server` ו־`apps/frontend` יכולים שניהם לייבא את אותם `designPayloadSchema`, `editVideoRequestSchema`, `OverlayType` וכו' ללא שכפול.
- אין drift בין סכמת Zod לטיפוס TS — `z.infer` הוא המקור היחיד.

**רע / מפתיע**

- שובר את הקו ההקסגונלי הרגיל "כל תכונה מחזיקה בסכמות שלה". התכונות של `apps/server` עכשיו מצביעות החוצה לחבילת ה־contract לסכמות ה־HTTP הנכנסות שלהן.
- מוסיף קצה build-order קשה: `@video-editor/contract` חייבת לבנות לפני ש־`apps/server` עושה type-check. (כבר נכון ל־subpaths של iframe/events — אותו שלב build.)
- חבילת ה־contract כבר לא ממפה 1:1 ל"משטח חיצוני". `/internal/*` הוא פנימי-בלבד אבל חי באותה התקנת `node_modules/@video-editor/contract`.

## חלופות שנשקלו

1. **השאר סכמות ב־`apps/server`, הוסף הערות CLAUDE.md על טווח.** נדחה — מסתמך על כך שהצוות החיצוני יקרא docs במקום לראות את הגבול בנתיב הייבוא.
2. **צור חבילת workspace נפרדת `@video-editor/server-contract`.** נדחה — מוסיף overhead workspace לחבילה ששום workspace אחר לא מייבא. ה־subpath `/internal/*` נותן את אותה בידוד עם חבילה אחת פחות.
3. **שלב סכמות משותפות ב־`apps/frontend` ו־`apps/server` באופן עצמאי.** נדחה — זו בעיית השכפול שכבר יש לנו.
