# מאגר משימות onboarding למפתח/ת חדש/ה

> **קהל יעד:** מפתח/ת שזה עתה הצטרף/ה לצוות, ללא ניסיון מקצועי. יודע/ת TypeScript בסיסי. אין עדיין היכרות עם הקוד שלנו.
>
> **איך משתמשים במסמך:** המנהל/ת בוחר/ת משימה אחת בכל פעם ומקצה אותה בג'ירה עם התווית `onboarding-friendly`. הסדר במסמך הזה הוא **הסדר להקצאה: מהקל ביותר לקשה ביותר**, מלמעלה למטה.

---

## איך מודדים את הקושי

| דרגה | מה זה אומר |
|---|---|
| **חימום (W)** | משימה שכמעט בלתי אפשרי לקלקל בה משהו. המטרה היא רק לעבור פעם אחת את כל התהליך: פתיחת branch → שינוי קטן → להריץ בדיקות → לפתוח PR → לקבל review → merge. |
| **L1** | שינוי מכני בקובץ אחד או שניים. אין צורך להבין הקשר רחב כדי לדעת מה התשובה הנכונה. ברגע שמסתכלים על הקוד, ברור מה לעשות. |
| **L2** | חייבים להבין **למה** הקוד הקיים נראה ככה לפני ששוברים אותו. צריך לעקוב אחרי ערך שזורם במערכת או לקרוא קובץ נוסף כדי לוודא שהשינוי לא שובר משהו במקום אחר. |
| **L3** | יש החלטה אמיתית עם trade‑off. צריך לשאול את הצוות, או לבדוק שתאימות לאחור לא נשברת, או להבין השפעה רחבה יותר. **לא משימה ראשונה.** |

## הקטגוריות (מפוזרות בכוונה)

| קוד | קטגוריה | למה זה חשוב |
|---|---|---|
| **A** | ולידציה של קלט | מלמד איך מגנים על המערכת בנקודות הכניסה |
| **B** | מעקב אחרי זרימת נתונים | בונה תמונה איך נתון עובר ממקום למקום |
| **C** | הגדרות / נכונות בזמן הפעלה | מלמד למה לתפוס באגים מוקדם עדיף |
| **D** | בהירות הודעות שגיאה | מלמד שהודעת שגיאה היא חוויית מפתח |
| **E** | נגישות / נכונות עיצוב | באג ויזואלי הוא באג אמיתי |
| **F** | ניקיון קוד / לוגים | מלמד למה drift בקוד הוא מקור לבאגים |

## טווח (מה כן ומה לא)

| בתוך הטווח | מחוץ לטווח |
|---|---|
| `apps/server` | `apps/iframe-demo` (harness לבדיקות, לא פרודקשן) |
| `apps/frontend` (כולל עיצוב, כשיש לזה השפעה אמיתית) | `apps/core-mock` (mock, לא בשימוש בפרודקשן) |
| `packages/contract` | `apps/mock-vod` (mock) |

## בדיקות חובה לפני כל PR

לפני שמבקשים review — להריץ את ארבע הפקודות האלה משורש הריפו:

```bash
pnpm lint
turbo run type-check
pnpm test
pnpm knip
```

כולן חייבות לעבור בירוק. אם משהו אדום — לתקן לפני שמבקשים review.

---

# סדר הקצאה — מהקל ביותר לקשה ביותר

| # | מזהה | דרגה | קטגוריה | מה זה |
|---|---|---|---|---|
| 1 | W1 | חימום | F | למחוק `console.log` של דיבאג |
| 2 | W2 | חימום | F | להאחיד `z.string().url()` → `z.url()` |
| 3 | W3 | חימום | E | לתקן typo של Tailwind |
| 4 | L1‑01 | L1 | A | להגביל אורך `mediaId` |
| 5 | L1‑02 | L1 | A | להגביל אורך `name` |
| 6 | L1‑03 | L1 | A | להגביל אורך `mediaName` |
| 7 | L1‑05 | L1 | C | `OTEL_ENDPOINT` חייב URL |
| 8 | L1‑06 | L1 | C | `SERVER_BASE_URL` חייב URL |
| 9 | L1‑04 | L1 | C | `LOG_LEVEL` חייב להיות מתוך רשימה |
| 10 | L1‑08 | L1 | C | `S3_*_PREFIX` חייבים להיות לא ריקים |
| 11 | L1‑07 | L1 | C | להגביל את `RENDER_URL_EXPIRY_SECONDS` |
| 12 | L1‑09 | L1 | D | להוסיף ערכים להודעת שגיאה |
| 13 | L2‑01 | L2 | F | `occurredAt` בפורמט ISO‑8601 |
| 14 | L2‑06 | L2 | B | להגביל את `cropRegion.width/height` |
| 15 | L2‑05 | L2 | B | `bodyLimit` ספציפי ל‑`/upload/signed-url` |
| 16 | L2‑02 | L2 | B | לאמת `traceparent` לפי W3C |
| 17 | L2‑07 | L2 | B | אזהרה ב‑boot כשמשובץ בלי origins |
| 18 | L2‑03 | L2 | A | `jobId` חייב להיות UUID |
| 19 | L2‑04 | L2 | F | לאחד `EXT_MIME_FALLBACK` בין frontend לserver |
| 20 | L3‑01 | L3 | A | להסיר `audio/mp3` הלא‑סטנדרטי |
| 21 | L3‑04 | L3 | B+A | retry מוגבל ב‑`HttpPreviewSourceAdapter` |
| 22 | L3‑03 | L3 | A | `EDITOR_READY` בלי `targetOrigin: "*"` |
| 23 | L3‑02 | L3 | A+C | רשימת CORS מפורשת |
| 24 | L3‑05 | L3 | C | rollout של `traceparent` בכל מערכת |

---

# #1 · W1 · חימום · F — להסיר `console.log` של דיבאג שנשכח בקוד של overlay

- **קובץ:** `apps/server/src/infrastructure/ffmpeg/overlays/overlay.service.ts:207-209`
- **השינוי:**

  לפני:
  ```ts
  const finalOutputStream = result.currentStream.replace(/^\[|\]$/g, "");
  console.log(
      `[buildOverlayFilters] Final output stream: ${finalOutputStream}, filter parts: ${result.filterParts.length}`,
  );
  ```

  אחרי (פשוט למחוק את שלוש השורות של `console.log`):
  ```ts
  const finalOutputStream = result.currentStream.replace(/^\[|\]$/g, "");
  ```

- **למה:** השורה הזאת כנראה נשארה ממישהו שעשה דיבאג. היא רצה בכל פעם שמייצרים סרטון עם overlay. בפרודקשן זה ממלא את הלוגים בזבל, ובנוסף — בכל שאר השרת אנחנו משתמשים בלוגר מסודר (Pino) ולא ב‑`console.log`. דרך טובה ללמוד למה היגיינה של לוגים חשובה.
- **בדיקה:** ידנית. אחרי המחיקה להריץ `grep -n 'buildOverlayFilters' apps/server/src` ולוודא שלא מופיע יותר. להריץ `pnpm test` ולוודא שהכול ירוק. אין צורך להוסיף טסט חדש.

---

# #2 · W2 · חימום · F — להאחיד את הסכמות בקובץ אחד: `z.string().url()` → `z.url()`

- **קובץ:** `packages/contract/src/internal/edit-video/schemas.ts:29, 43`
- **השינוי:**

  לפני (שורה 29 ושורה 43):
  ```ts
  imageUrl: z.string().url(),
  sourceUrl: z.string().url(),
  ```

  אחרי:
  ```ts
  imageUrl: z.url(),
  sourceUrl: z.url(),
  ```

- **למה:** באותו קובץ עצמו (שורות 128, 136, 155) כבר משתמשים בצורה הקצרה `z.url()`. שתי השורות האלה נשארו בצורה הישנה. השינוי לא משנה התנהגות — הוא רק מאחד את הסגנון. דרך טובה ללמוד שגם הקפדה על אחידות היא חלק מהעבודה.
- **בדיקה:** ידנית. הטסטים הקיימים ב‑`packages/contract/src/internal/edit-video/__tests__/` חייבים להישאר ירוקים. אין צורך להוסיף טסט חדש.

---

# #3 · W3 · חימום · E — לתקן typo במחלקת Tailwind שגורם לכיתוב לא להיצבע נכון

- **קובץ:** `apps/frontend/src/features/editor/scene/empty.tsx:63`
- **השינוי:**

  לפני (יש typo: `text-forground` במקום `text-foreground`, וגם רווח כפול לפני `p-2`):
  ```tsx
  <div className="hover:bg-primary-dark cursor-pointer rounded-md border border-dashed  p-2 text-forground transition-colors duration-200">
  ```

  אחרי:
  ```tsx
  <div className="hover:bg-primary-dark cursor-pointer rounded-md border border-dashed p-2 text-foreground transition-colors duration-200">
  ```

- **למה:** `text-forground` לא קיים בכלל בתור utility class של Tailwind, אז המחלקה הזאת פשוט מתעלמים ממנה והכיתוב לא מקבל את הצבע הנכון. זה באג ויזואלי אמיתי שאף אחד לא שם לב אליו כי האלמנט יורש צבע סביר מההורה. השינוי גם מנקה רווח כפול.
- **בדיקה:** ידנית. להריץ `pnpm dev` של ה‑frontend, להיכנס לאדיטור עם פרויקט ריק, לראות את הריבוע של "לחץ להעלאה" ולוודא שהאייקון מקבל את הצבע של `text-foreground` (אפשר להשוות לאלמנט אחר באותו צבע במסך). הטסטים הרגילים לא תופסים typo של Tailwind, אז העין שלך היא הבדיקה.

---

# #4 · L1‑01 · L1 · A — להגביל אורך של `mediaId` בהודעה `EDITOR_ADD_MEDIA`

- **קובץ:** `packages/contract/src/iframe/from-parent/schemas.ts:126`
- **השינוי:**

  לפני:
  ```ts
  export const editorAddMediaMessageSchema = z.strictObject({
      type: z.literal("EDITOR_ADD_MEDIA"),
      mediaId: nonEmptyString,
  });
  ```

  אחרי:
  ```ts
  export const editorAddMediaMessageSchema = z.strictObject({
      type: z.literal("EDITOR_ADD_MEDIA"),
      mediaId: nonEmptyString.max(128),
  });
  ```

- **למה:** ההורה (האפליקציה שמטמיעה את האדיטור בתוך iframe) שולח לנו `mediaId` כחלק מההודעה. אם הוא שולח מזהה ארוך מאוד, הוא מתפזר אצלנו בכל מקום: בכתובות שאנחנו בונים (`/media/{id}/watch`, `/storage/{id}/image`), בלוגים, ובמטמון התגובות. הגבלה ל‑128 תווים זה הגנה אמיתית מפני שימוש לרעה או באג בצד ההורה.
- **בדיקה:** להוסיף ב‑`packages/contract/src/iframe/from-parent/__tests__/schemas.test.ts` בדיקה שמזהה באורך 129 תווים נכשל, ואחד באורך 128 עובר.

---

# #5 · L1‑02 · L1 · A — להגביל אורך של השדה `name` (גם ב‑recording-range וגם ב‑audio-range)

- **קובץ:** `packages/contract/src/iframe/from-parent/schemas.ts:39, 72`
- **השינוי:**

  לפני (בשני המקומות):
  ```ts
  name: z.string().optional(),
  ```

  אחרי:
  ```ts
  name: z.string().max(200).optional(),
  ```

- **למה:** השדה `name` מגיע ישירות לטיימליין שלנו ולשמות שמופיעים בכותרת של פריט. אם ההורה שולח טקסט באורך מגוחך (נגיד 1MB), זה מנפח את הזיכרון של הסטור, ממלא את הלוגים ויכול להאט את ה‑UI. 200 תווים זה גג שמתאים לכותרת אנושית.
- **בדיקה:** באותו קובץ טסטים — להוסיף בדיקה שאורך 201 נכשל, באורך 200 עובר. לעשות את זה לשתי הסכמות.

---

# #6 · L1‑03 · L1 · A — להגביל אורך של `mediaName` באירוע `export.started`

- **קובץ:** `packages/contract/src/events/export.ts:21`
- **השינוי:**

  לפני:
  ```ts
  export const exportStartedDataSchema = z.strictObject({
      jobId: nonEmptyString,
      mediaId: nonEmptyString,
      mediaName: nonEmptyString,
      ...
  });
  ```

  אחרי:
  ```ts
  mediaName: nonEmptyString.max(200),
  ```

- **למה:** הסכמות תחת `events/` הן החוזה הציבורי שצוותים אחרים בארגון מתחברים אליו (הם נרשמים ל‑exchange של RabbitMQ ומקבלים את ההודעות). מה שאנחנו לא מגבילים בסכמה — הם יקבלו, ואנחנו אחראים. בפועל, השדה הזה תמיד מגיע מ‑`SaveMetadata` בצד שלנו (לראות `apps/server/src/features/render/adapters/inbound/http/render.controller.ts:13`), אז אין חשש לשבור משהו פנימי.
- **בדיקה:** להוסיף את הבדיקה ל‑`packages/contract/src/events/__tests__/export.test.ts`.

---

# #7 · L1‑05 · L1 · C — לוודא ש‑`OTEL_ENDPOINT` הוא URL תקין (אם הוא קיים)

- **קובץ:** `apps/server/src/config/env.ts:21`
- **השינוי:**

  לפני:
  ```ts
  OTEL_ENDPOINT: z.string().optional(),
  ```

  אחרי:
  ```ts
  OTEL_ENDPOINT: z.url().optional(),
  ```

- **למה:** ההערה בקוד עצמו אומרת "OTel disabled when OTEL_ENDPOINT absent" — אבל הסכמה הנוכחית לא מבחינה בין "המשתנה לא קיים" לבין "המשתנה קיים אבל מקולקל" (נגיד `htp://localhost`). תקלת כתיב כזאת או מבטלת telemetry בלי שאף אחד שם לב, או מפוצצת את ה‑OTel SDK בשליחת ה‑span הראשון. שינוי ל‑`z.url()` תופס את זה ב‑boot.
- **בדיקה:** Vitest שבודק שלוש מצבים: לא קיים (עובר), URL תקין (עובר), `htp://x` (נכשל). להוסיף ב‑`apps/server/src/bootstrap/__tests__/`.

---

# #8 · L1‑06 · L1 · C — לוודא ש‑`SERVER_BASE_URL` הוא URL תקין

- **קובץ:** `apps/server/src/config/env.ts:64`
- **השינוי:**

  לפני:
  ```ts
  SERVER_BASE_URL: z.string(),
  ```

  אחרי:
  ```ts
  SERVER_BASE_URL: z.url(),
  ```

- **למה:** המשתנה הזה משמש לבניית URL חתום לסגמנטים של וידאו (לראות `apps/server/src/features/preview/adapters/outbound/http/HttpPreviewSourceAdapter.ts:72`: `new URL(play.url, this.serverBaseUrl)`). אם הערך לא תקין, ההפעלה תיכשל **כשמשתמש ינסה לראות preview** — עם הודעה מבלבלת על `Invalid URL`. עדיף לתפוס את זה ב‑boot.
- **בדיקה:** Vitest שמנסה ערך לא תקין ומצפה לכישלון. להוסיף ב‑`apps/server/src/bootstrap/__tests__/`.

---

# #9 · L1‑04 · L1 · C — להגביל את `LOG_LEVEL` לרמות החוקיות של Pino

- **קובץ:** `apps/server/src/config/env.ts:20`
- **השינוי:**

  לפני:
  ```ts
  LOG_LEVEL: z.string().default("info"),
  ```

  אחרי:
  ```ts
  LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
      .default("info"),
  ```

- **למה:** היום אם מישהו כתב בטעות `LOG_LEVEL=infoo` ב‑`.env`, השרת **עולה כרגיל** ורק בלוג הראשון Pino מתפוצץ עם stack trace מבלבל. אנחנו רוצים לתפוס שגיאות הגדרה ב‑boot, לא חצי שעה אחרי שהשרת בפרודקשן. השינוי הזה מבטיח שאם הערך לא חוקי, השרת לא יעלה בכלל ונראה את השגיאה מיד.
- **בדיקה:** להוסיף Vitest בתיקייה `apps/server/src/bootstrap/__tests__/` שמנסה לפרסר env עם `LOG_LEVEL` לא חוקי ומצפה ש‑`parseApiEnv()` יזרוק שגיאה.

---

# #10 · L1‑08 · L1 · C — לדרוש שמשתני `S3_*_PREFIX` יהיו לא ריקים

- **קובץ:** `apps/server/src/config/env.ts:42, 71, 75`
- **השינוי:**

  לפני:
  ```ts
  S3_OUTPUT_PREFIX: z.string().default("output"),
  S3_PREVIEW_PREFIX: z.string().default("preview"),
  S3_UPLOAD_PREFIX: z.string().default("uploads"),
  ```

  אחרי:
  ```ts
  S3_OUTPUT_PREFIX: z.string().min(1).default("output"),
  S3_PREVIEW_PREFIX: z.string().min(1).default("preview"),
  S3_UPLOAD_PREFIX: z.string().min(1).default("uploads"),
  ```

- **למה:** `.default()` של Zod רץ **רק אם המשתנה לא קיים בכלל**. אם בקובץ `.env` כתוב `S3_OUTPUT_PREFIX=` (ריק), Zod לוקח את הריק ומעביר אותו הלאה בלי לקפוץ ל‑default. ה‑worker בונה מפתחות ב‑S3 לפי `<S3_OUTPUT_PREFIX>/<jobId>.<format>`. עם prefix ריק, הוא יכתוב לתיקיית השורש של ה‑bucket, מה ששובר את בדיקת ה‑idempotency שלו ב‑retry. `.min(1)` מטפל במצב הריק ועדיין שומר על ברירת המחדל.
- **בדיקה:** Vitest שמוודא שהערך הריק נכשל.

---

# #11 · L1‑07 · L1 · C — להגביל את `RENDER_URL_EXPIRY_SECONDS` שלא יהיה אפס או נצח

- **קובץ:** `apps/server/src/config/env.ts:43`
- **השינוי:**

  לפני:
  ```ts
  RENDER_URL_EXPIRY_SECONDS: z.coerce.number().default(86400),
  ```

  אחרי:
  ```ts
  RENDER_URL_EXPIRY_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(7 * 24 * 60 * 60)
      .default(86400),
  ```

- **למה:** היום `RENDER_URL_EXPIRY_SECONDS=0` יעבור בלי תלונה, וכל URL חתום שנוצור יידחה מיד ב‑S3 — תוצאה: סרטונים "מסתיימים" אבל לא נפתחים, בלי שגיאה ברורה. מצד שני, ערך ענק חוצה את מדיניות האבטחה שלנו. הטווח 1 דקה עד 7 ימים סביר ביחס לברירת המחדל של 24 שעות.
- **בדיקה:** Vitest שמוודא שגם `0` וגם `9999999999` נכשלים.

---

# #12 · L1‑09 · L1 · D — להוסיף ערכים אמיתיים להודעת השגיאה של `endTimeMs/startTimeMs`

- **קובץ:** `apps/server/src/features/preview/adapters/inbound/http/preview.controller.ts:185-189`
- **השינוי:**

  לפני:
  ```ts
  if (endTimeMs <= startTimeMs) {
      throw new HttpError({
          statusCode: HttpStatus.BAD_REQUEST,
          message: "endTimeMs must be greater than startTimeMs",
      });
  }
  ```

  אחרי:
  ```ts
  if (endTimeMs <= startTimeMs) {
      throw new HttpError({
          statusCode: HttpStatus.BAD_REQUEST,
          message: `endTimeMs (${endTimeMs}) must be greater than startTimeMs (${startTimeMs})`,
      });
  }
  ```

- **למה:** היום ההורה רואה הודעה כללית ולא יכול לדעת אם הוא שלח ערכים שווים, מוחלפים, או טעות של 1ms. הוספת הערכים עצמם להודעה חוסכת חצי שעת חיפוש בכל פעם שמישהו פותח בעיה.
- **בדיקה:** לעדכן את הטסט ב‑`apps/server/src/features/preview/adapters/inbound/http/__tests__/preview.controller.e2e.test.ts` שיתאים להודעה החדשה, ולהוסיף מקרה שבו `endTimeMs === startTimeMs` כדי לוודא ששני הערכים מופיעים בהודעה.

---

# #13 · L2‑01 · L2 · F — להדק את `occurredAt` לפורמט ISO‑8601 (תאריך תקין)

- **קובץ:** `packages/contract/src/events/envelope.ts:20`
- **השינוי:**

  לפני:
  ```ts
  occurredAt: z.string().min(1),
  ```

  אחרי:
  ```ts
  occurredAt: z.iso.datetime(),    // ב‑Zod v4 — לוודא את הכתיב המדויק; ב‑v3 זה z.string().datetime()
  ```

- **למה:** ה‑README של החבילה (`packages/contract/src/events/README.md:37`) אומר במפורש ש‑`occurredAt` הוא "ISO‑8601 UTC timestamp" — אבל הסכמה לא אוכפת את זה. הצד שלנו (`apps/server/src/infrastructure/messaging/RabbitMQPublisher.ts:504`) קורא ל‑`new Date().toISOString()`, אז אנחנו בסדר. **למה L2:** צוותים חיצוניים שמייצרים פיקסטורות לבדיקות עשויים להשתמש בערך שאינו ISO ("2026-01-01" נגיד); אכיפת הסכמה תשבור להם טסטים. צריך לוודא שהשינוי הוא חלק מ‑version bump מתוכנן ולא נכנס "סתם".
- **בדיקה:** בקובץ `packages/contract/src/events/__tests__/export.test.ts` להוסיף בדיקה שמחרוזת לא תקינה נכשלת, ושמחרוזת מ‑`new Date().toISOString()` עוברת.

---

# #14 · L2‑06 · L2 · B — להגביל את `cropRegion.width/height` בהתאם לשאר הסכמה

- **קובץ:** `packages/contract/src/internal/edit-video/schemas.ts:164-171`
- **השינוי:**

  לפני:
  ```ts
  cropRegion: z
      .object({
          x: z.number().min(0),
          y: z.number().min(0),
          width: z.number().min(2),
          height: z.number().min(2),
      })
      .optional(),
  ```

  אחרי:
  ```ts
  cropRegion: z
      .object({
          x: z.number().min(0).max(8192),
          y: z.number().min(0).max(8192),
          width: z.number().min(2).max(8192),
          height: z.number().min(2).max(8192),
      })
      .optional(),
  ```

- **למה:** באותו קובץ עצמו, סכמות ה‑overlay (שורות 35–36, 49–50, 77–78, 93–94, 110–111) מגבילות `width/height` ל‑10000. ל‑`cropRegion` אין גבול עליון, אז payload פגום יעבור Zod, יזרום ל‑FFmpeg, ויפיק קובץ עזר של כמה GB או buffer שלא ניתן להקצות. **למה L2:** הגבול הנכון תלוי בהחלטה — 8192 (8K — הסטנדרט שלנו לקנבסים), 10000 (כמו השכנים), או משהו אחר. צריך לקרוא את הסכמות הסמוכות ולתעד את הבחירה ב‑PR.
- **בדיקה:** Vitest שמוודא ש‑8193 נכשל, 8192 עובר.

---

# #15 · L2‑05 · L2 · B — להוסיף `bodyLimit` ספציפי לראוט `POST /upload/signed-url`

- **קובץ:** `apps/server/src/features/upload/adapters/inbound/http/upload.controller.ts:75-78`
- **השינוי:**

  לפני:
  ```ts
  fastify.post(
      "/upload/signed-url",
      { schema: getSignedUrlRequestSchema },
      async (request: Request<GetSignedUrlRequest>, reply: FastifyReply) => {
          ...
      },
  );
  ```

  אחרי:
  ```ts
  fastify.post(
      "/upload/signed-url",
      { schema: getSignedUrlRequestSchema, bodyLimit: 4096 },
      async (request, reply) => { ... },
  );
  ```

- **למה:** ה‑body של הבקשה הזאת הוא JSON קטנטן: `{ filename, mimetype, size }`. כמה מאות בתים לכל היותר. Fastify נותן 1MB כברירת מחדל לכל ה‑routes. הקטנת המגבלה ספציפית לראוט הזה ל‑4KB מצמצמת את שטח התקיפה. צריך לוודא: (א) לקרוא את הסכמה ב‑`packages/contract/src/internal/upload/schemas.ts`, (ב) לבדוק שאין מגבלה אחרת ב‑`bootstrap/server.ts`, (ג) להבין ש‑nginx (`apps/frontend/nginx.conf`) כן חוסם ב‑500MB את `^/upload` — אבל זה ל‑PUT הישיר ל‑MinIO, **לא** לראוט הזה.
- **בדיקה:** Vitest שמשגר body של 5KB ומצפה ל‑413.

---

# #16 · L2‑02 · L2 · B — לאמת את `traceparent` לפי הפורמט של W3C trace context

- **קובץ:** `packages/contract/src/events/envelope.ts:21`
- **השינוי:**

  לפני:
  ```ts
  traceparent: z.string().optional(),
  ```

  אחרי:
  ```ts
  // W3C traceparent: "00-<32 hex>-<16 hex>-<2 hex>"  — בסך הכול 55 תווים
  traceparent: z
      .string()
      .regex(/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/)
      .optional(),
  ```

- **למה:** `traceparent` הוא הדרך ש‑OpenTelemetry מקשר span אצלנו ל‑span בצד הצרכן. אם הערך מעוות, הקישור נשבר בשקט וכל הניתוח של trace cross‑service "תקוע". צריך לקרוא את `RabbitMQPublisher.ts:505` (היום מוגדר `undefined`) כדי להבין מי כותב את הערך הזה ולמה.
- **בדיקה:** Vitest שמכסה: ערך תקין עובר, ערך לא תקין נכשל, `undefined` עדיין מותר.

---

# #17 · L2‑07 · L2 · B — להזהיר ב‑boot כשהאדיטור משובץ ב‑iframe בלי `VITE_EDITOR_PARENT_ORIGINS`

- **קובץ:** `apps/frontend/src/features/editor/external-preview/use-editor-post-message.ts:14-18, 46-50`
- **השינוי:** בתוך ה‑`useEffect`, אחרי הבלוק הקיים של `if (window.parent !== window)`, להוסיף:

  ```ts
  const envProvidedOrigins = parseAllowedOrigins(import.meta.env.VITE_EDITOR_PARENT_ORIGINS);
  if (window.parent !== window && envProvidedOrigins.size === 0) {
      console.warn(
          "[useEditorPostMessage] Editor embedded but VITE_EDITOR_PARENT_ORIGINS is unset — "
          + "parent messages will be ignored unless the parent shares the editor's origin.",
      );
  }
  ```

- **למה:** היום, deploy שבו שכחו להגדיר את `VITE_EDITOR_PARENT_ORIGINS` מוחק בשקט כל הודעה מההורה — ולצוות ההורה אין שום משוב למה זה לא עובד. צריך לעקוב אחרי `parseAllowedOrigins` → `allowedOrigins` → ה‑`if (!allowedOrigins.has(event.origin)) return;` ב‑`handle-parent-message.ts:80-82` כדי להבין למה ההודעות נעלמות. הודעת אזהרה מציפה את הבעיה.
- **בדיקה:** להוסיף Vitest ב‑`apps/frontend/src/features/editor/external-preview/__tests__/` שמדמה `window.parent !== window` עם משתנה סביבה ריק, מרגל על `console.warn`. (יש שם כבר `payload-intake.test.ts` ו‑`handle-parent-message.test.ts` — אפשר להוסיף לסמוך ביותר.)

---

# #18 · L2‑03 · L2 · A — לדרוש פורמט UUID על `jobId` בסכמת render

- **קובץ:** `packages/contract/src/internal/edit-video/schemas.ts:163`
- **השינוי:**

  לפני:
  ```ts
  jobId: z.string(),
  ```

  אחרי:
  ```ts
  jobId: z.string().uuid(),
  ```

- **למה:** ה‑worker בונה את המפתח ב‑S3 לפי הנוסחה `<S3_OUTPUT_PREFIX>/<jobId>.<format>`. אם `jobId` יכיל `../foo`, נקבל path traversal בכתיבה ל‑S3. היום ה‑controller בצד ה‑HTTP תמיד יוצר `randomUUID()` (לראות `render.controller.ts:61`), אז הצד הציבורי בטוח. **אבל אותה סכמה משמשת גם את ה‑validator של ההודעה ב‑AMQP אצל ה‑worker** — וזה גבול אמון שונה. הידוק לפורמט UUID זה הגנה בעומק.

  צריך לוודא: (א) לקרוא את ה‑controller, (ב) לקרוא את `apps/server/src/infrastructure/messaging/schemas/commands.ts`, (ג) לחפש בכל הטסטים אם יש פיקסטורה עם `jobId` שאינו UUID (`grep -rn 'jobId:'`).
- **בדיקה:** הוספת בדיקה ב‑`packages/contract/src/internal/edit-video/__tests__/`, ולעדכן כל פיקסטורה ישנה.

---

# #19 · L2‑04 · L2 · F — לאחד את `EXT_MIME_FALLBACK` בין ה‑frontend לבין ה‑server

- **קבצים:**
  - `apps/frontend/src/utils/upload-service.ts:5-22`
  - `apps/server/src/features/upload/adapters/inbound/http/upload.controller.ts:15-56`
- **השינוי:** להוציא טבלה אחת קנונית (extension → mime, ורשימת mimes מורשים) לקובץ חדש תחת `packages/contract/src/internal/upload/` (לדוגמה `mime.ts`), ולייבא משם בשני הצדדים. שתי הטבלאות הקיימות **כבר לא מסתדרות**:
  - השרת מקבל `audio/mp3` **וגם** `audio/mpeg`; ה‑frontend ממפה `.mp3` ל‑`audio/mpeg` בלבד.
  - השרת מקבל `audio/x-wav`, `audio/x-flac`, `audio/x-m4a`; ה‑frontend לא יודע על אלה.
  - השרת מקבל `image/jpg`; ה‑frontend ממפה `.jpg` ל‑`image/jpeg`.
- **למה:** drift כזה הוא מקור באמת לבאגים. דוגמה אמיתית: משתמש בוחר קובץ, הדפדפן ממלא `Content-Type` שאחד הצדדים מקבל והשני דוחה — והוא מקבל 400 מבלבל אחרי שכבר התחיל להעלות. מקור אמת אחד מבטל את כל המעמד הזה של באגים. **למה L2:** הרשימה המאוחדת תהיה או יותר הדוקה (פוסלים פורמטים שאולי היו מתקבלים), או יותר מתירנית (שינוי בשטח האבטחה). זאת החלטה שצריך לאשר עם הצוות.
- **בדיקה:** להוסיף Vitest ב‑`packages/contract/src/internal/upload/__tests__/mime.test.ts` שמוודא: (א) לכל extension יש mime מורשה, (ב) לכל mime מורשה יש extension לפחות אחד. לעדכן את הטסטים של ה‑upload controller להשתמש במודול החדש.

---

# #20 · L3‑01 · L3 · A — להסיר את ה‑mime הלא‑סטנדרטי `"audio/mp3"` מרשימת ההיתר של ה‑upload

- **קובץ:** `apps/server/src/features/upload/adapters/inbound/http/upload.controller.ts:24`
- **השינוי:** במערך `ALLOWED_MIMES` נמצאים שני ערכים:

  ```ts
  "audio/mpeg",   // שורה 23 — תקין לפי IANA
  "audio/mp3",    // שורה 24 — alias לא‑סטנדרטי
  ```

  למחוק את שורה 24.
- **למה:** `audio/mp3` לא רשום ב‑IANA; דפדפנים מודרניים שולחים `audio/mpeg` עבור קבצי mp3. **למה L3:** הסרה יכולה לשבור (א) סקריפט ישן שמשתמש כותב/ת ידנית `Content-Type: audio/mp3`, (ב) מערכת משובצת ברשת הסגורה עם defaults מוזרים. הצוות צריך להחליט אם הניקיון שווה את הסיכון לרגרסיה, ואם לתאם עם צוותי ההורים לפני השינוי.
- **בדיקה:** לעדכן את טסטי ה‑upload controller. המקרה שעבר עם `audio/mp3` עכשיו אמור לחזור 400. בתיאור ה‑PR לציין לפחות לקוח אמיתי אחד ולוודא שהוא שולח `audio/mpeg`.

---

# #21 · L3‑04 · L3 · B+A — להוסיף retry מוגבל ל‑`HttpPreviewSourceAdapter`

- **קובץ:** `apps/server/src/features/preview/adapters/outbound/http/HttpPreviewSourceAdapter.ts:41-44, 83-86, 130-133`
- **השינוי:** לעטוף כל קריאת `fetch` ב‑retry מוגבל (ניסיון אחד חוזר על 502/503/504 ושגיאות חיבור) עם backoff קטן. ה‑`AbortSignal.timeout` כבר קיים.
- **למה:** היום 503 בודד מ‑Core גורר כישלון מיידי של יצירת ה‑preview אצל המשתמש. retry אחד היה מסתיר תקלות זמניות. **למה L3:** ה‑GET של Core ל‑`/channels/:id/play` ול‑`/videos/:id/play` הוא idempotent מבחינת HTTP, אבל לפעמים יש לצוות ה‑Core חישוב עלות לכל קריאה. צריך לוודא איתם שה‑retry בטוח. בנוסף: 404 (שמגיע כ‑`RangeError`) **אסור** ל‑retry. ההחלטה דורשת חוזה עם הצוות שמעל.
- **בדיקה:** Vitest ב‑`apps/server/src/features/preview/adapters/outbound/http/__tests__/HttpPreviewSourceAdapter.test.ts` (הקובץ קיים) עם mock של `fetch` שמחזיר 503 פעם אחת ואז 200.

---

# #22 · L3‑03 · L3 · A — להחליף את ה‑`targetOrigin: "*"` של `EDITOR_READY` במקור ידוע

- **קובץ:** `apps/frontend/src/features/editor/external-preview/use-editor-post-message.ts:49`
- **תיאור הבעיה (לא תיקון מוגדר):**

  ```ts
  window.parent.postMessage(readyMsg, "*");
  ```

- **למה:** `targetOrigin: "*"` שולח לכל הורה שיחליף את ה‑iframe — גם אם ה‑payload עצמו ריק (`{ type: "EDITOR_READY" }`), זאת ההודעה היחידה שלנו ששוברת את משמעת המקור הקפדנית שיש בכל שאר הזרימה (`handle-parent-message.ts:80-82` דוחה origins לא מוכרים). **למה L3:** ברגע ההפעלה האדיטור עדיין לא יודע איזה origin ההורה מציג. אופציות לשקול:

  - (א) לעבור על `allowedOrigins` ולשלוח לכל אחד — מציף את ההודעה כמה פעמים.
  - (ב) להוציא origin מ‑`document.referrer` — שביר אם ההורה חוסם Referer.
  - (ג) להשאיר `"*"` ולתעד שה‑payload לא רגיש.
  - (ד) לחכות להודעה הראשונה מההורה לפני שמשגרים `EDITOR_READY`.

  לכל אופציה יש trade‑off של UX מול אבטחה. שיחה עם בכיר וצוות ההורה נדרשת.
- **בדיקה:** Vitest על האופציה שנבחרה. אם אופציה (ד) — לתאם עם בכיר את הבדיקה ב‑harness של iframe‑demo (מחוץ לטווח שלנו, אז צריך עזרה).

---

# #23 · L3‑02 · L3 · A+C — להחליף `cors({ origin: true })` ברשימת מקורות מפורשת מ‑env

- **קובץ:** `apps/server/src/bootstrap/server.ts:26`
- **השינוי:**

  לפני:
  ```ts
  await this.app.register(cors, { origin: true });
  ```

  אחרי (סקיצה — הצורה המדויקת תלויה בהחלטת הצוות):
  ```ts
  await this.app.register(cors, {
      origin: this.config.ALLOWED_ORIGINS, // משתנה env חדש, מופרד בפסיקים, מוולד ב‑boot
  });
  ```

  + להוסיף `ALLOWED_ORIGINS` ל‑`apiEnvSchema` ב‑`env.ts` בתור משתנה חובה.
- **למה:** `origin: true` מחזיר כ‑allowed את ה‑Origin שהגיע — אפקטיבית wildcard. גם ברשת סגורה זה מסוכן אם דפדפן פנימי "מבקר" בכתובת מוזרה. **למה L3:** ה‑origins האמיתיים שונים בכל סביבה (`.env`, `.env.preprod`, `.env.production`). בחירת הסכמה הנכונה, החלטה איך להתנהג עם `null` (file://, webview), ותיאום rollout של ה‑env var עם infra — כל אלה דורשים שיקול בכיר. חיתוך לא נכון שובר preprod בשקט.
- **בדיקה:** Vitest ב‑`bootstrap/__tests__/` שמוודא דחייה למקור לא ברשימה, וקבלה למקור ברשימה. ידנית: להעלות ל‑preprod עם המשתנה המוגדר ולהריץ את ה‑iframe‑demo מולו.

---

# #24 · L3‑05 · L3 · C — להפוך את `traceparent` למשהו שמתפזר אוטומטית בפועל

- **קבצים:** `packages/contract/src/events/envelope.ts:21` + `apps/server/src/infrastructure/messaging/RabbitMQPublisher.ts:505` (שם זה היום hard‑coded ל‑`undefined`)
- **השינוי:** לחבר את ה‑`traceparent` מה‑span הפעיל של OTel ל‑envelope בזמן publish, ובהמשך — להפוך את השדה לחובה בסכמה ברגע שכל המפרסמים מוכנים.
- **למה:** בלי `traceparent` שמתפזר, ה‑spans של הצרכן לא מתחברים ל‑spans שלנו — ה‑trace בין שירותים נשבר. **למה L3:** היום השדה `undefined` בכל מקום. להפוך אותו לחובה זה rollout מתואם (קודם publish בכל מקום, אחר כך אכיפה). צריך לוודא: (א) ש‑OTel מופעל בכל סביבה שמפרסמת אירועים, (ב) לתאם את ה‑schema bump עם צרכנים, (ג) להחליט אם להוציא קודם את צד ה‑publisher ורק אחר כך את הסכמה.
- **בדיקה:** Vitest על לוגיקת ההפצה של ה‑publisher עם span context מדומה. בדיקת סכמה שמאשרת חובה כשמתאים.

---

# הוראות שימוש למנהל/ת

1. לכל משימה לפתוח issue/ticket בג'ירה עם התווית `onboarding-friendly`.
2. להעתיק את ה‑ID, הכותרת, התיאור, "השינוי" ו‑"הבדיקה" לתיאור הטיקט.
3. להוסיף את ארבע פקודות ה‑pre‑PR בתחתית כל טיקט.
4. **לא** להקצות שתי משימות במקביל. אחת בכל פעם.
5. אחרי כל merge — שיחת רטרו של 10 דקות: מה היה ברור, מה היה מבלבל, מה אפשר לשפר במאגר.
