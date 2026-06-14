# React Video Editor

עורך וידאו מבוסס דפדפן, full-stack, שנבנה על גבי [Remotion](https://www.remotion.dev/) ו־React 19. הרכב סצנות על ציר זמן drag-and-drop, החל transitions ו־overlays, ואז ייצא לווידאו — הכול מהדפדפן.

> **יעד הפריסה:** סביבות רשת סגורות ומבודדות (air-gapped). כל התשתית (MinIO, RabbitMQ, FFmpeg) self-hosted. אין צורך או ציפייה לגישת אינטרנט ציבורית בזמן ריצה.

## תיעוד

תיקיית `wiki/` משקפת את הוויקי של GitLab עבור פריסות רשת סגורה. העתק את התוכן שלה למאגר `<project>.wiki.git` שלך בעת הצורך.

## ארכיטקטורה

| אפליקציה / חבילה | תיאור | פורט |
|---|---|---|
| `apps/frontend` | Vite + React 19 SPA — ממשק המשתמש של העורך | 3000 |
| `apps/server` | Fastify + Node.js. **API** (פורט 4001) מטפל בהעלאות + מכניס לתור jobs רינדור; **Worker** (probe פורט 8081) צורך את התור + מריץ FFmpeg | 4001 / 8081 |
| `apps/iframe-demo` | Angular 21 harness לבדיקת אינטגרציית iframe | 8080 |
| `apps/core-mock` | Mock רק לפיתוח של שירות Core מבוסס Fastify במעלה הזרם | 8002 |
| `apps/mock-vod` | Mock רק לפיתוח של שירות VOD מבוסס Fastify במעלה הזרם | 5050 |
| `packages/contract` | `@video-editor/contract` — סכמות/טיפוסים של Zod. Subpaths: `/iframe/from-parent`, `/iframe/to-parent`, `/events`, `/internal/*` | — |

## דרישות מקדימות

- Node.js 22.18+
- pnpm 10+
- Docker (עבור MinIO + RabbitMQ)
- FFmpeg (מותקן אוטומטית דרך `@ffmpeg-installer/ffmpeg`)

## תחילת עבודה

**1. התקן תלויות**

```bash
pnpm install
```

**2. הפעל תשתיות**

```bash
docker compose up -d
```

זה מפעיל את MinIO (אחסון תואם S3, פורטים 9000/9001) ו־RabbitMQ (פורט 5672, ממשק ניהול 15672).

**3. הגדר את השרת**

העתק וערוך את סביבת השרת:

```bash
cp apps/server/.env.example apps/server/.env
```

משתנים מרכזיים (לכולם יש ברירות מחדל לפיתוח מקומי):

| משתנה | ברירת מחדל | תיאור |
|---|---|---|
| `PORT` | `4001` | פורט שרת ה־API |
| `S3_ENDPOINT` | `http://localhost:9000` | endpoint של MinIO |
| `S3_ACCESS_KEY_ID` | `minioadmin` | מפתח גישה ל־MinIO |
| `S3_SECRET_ACCESS_KEY` | `minioadmin123` | סוד של MinIO |
| `CORE_BASE_URL` | חובה | URL בסיס של שירות Core במעלה הזרם (כולל `/private`). פיתוח: `http://localhost:8002/private` |
| `PREVIEW_SIGNING_SECRET` | חובה | סוד HMAC-SHA256 (מינימום 32 תווים) ל־URLs חתומים של segment proxy |
| `QUEUE_URL` | חובה | URL חיבור AMQP לפרסום אירועי ייצוא. `amqps://` מפעיל mTLS (קורא `/bundle.pem` + `/tmp/certificates/rabbitmq/rabbit_{cert,key}.pem` באתחול) |

ראה [apps/server/README.md](apps/server/README) ל־schema המלא של env.

**4. הרץ הכול**

```bash
pnpm dev
```

זה מריץ frontend, server ו־iframe-demo במקביל דרך Turborepo.

## פקודות workspace

```bash
pnpm dev          # Run all apps in parallel
pnpm build        # Build all apps
pnpm lint         # Lint all apps (Biome)
pnpm format       # Format all apps (Biome)
pnpm test         # Run all test suites
```

פקודות לכל אפליקציה מתועדות ב־README של כל אפליקציה.

## תכונות מרכזיות

- **עורך ציר זמן** — גרור, חתוך וסדר מחדש tracks של וידאו/אודיו/תמונה
- **Remotion Player** — preview מדויק לפריים בדפדפן
- **עיבוד FFmpeg** — קליטת HLS/DASH בצד שרת, הרכבת overlay
- **אחסון S3** — העלה assets ל־MinIO (מקומי) או כל אחסון תואם S3
- **Pipeline ייצוא** — FFmpeg (דרך `spawn` גולמי) מרנדר ומעבד וידאו בשרת
- **הטמעת iframe** — הטמע את העורך בכל דף דרך API של postMessage
- **אירועי RabbitMQ** — השרת מפרסם `export.started`, `export.completed`, `export.failed` ל־topic exchange של `video-editor`

## אינטגרציית iframe

ניתן להטמיע את העורך ב־`/editor/embed` ולשלוט עליו דרך `postMessage`. החבילה `@video-editor/contract` מספקת סכמות Zod מוקלדות בארבעה subpaths:

- `@video-editor/contract/iframe/from-parent` — הודעות הורה → עורך
- `@video-editor/contract/iframe/to-parent` — הודעות עורך → הורה
- `@video-editor/contract/events` — מעטפות אירועי RabbitMQ (צרכנים חיצוניים)
- `@video-editor/contract/internal/<feature>` — סכמות HTTP בבעלות השרת (לא לשימוש חיצוני)

ראה [packages/contract/README.md](packages/contract/README) ו־[apps/iframe-demo/README.md](apps/iframe-demo/README) לפרטים.

## Tech Stack

**Frontend:** React 19, Vite, Remotion, Zustand, TanStack Query, Tailwind v4, shadcn/ui, `@designcombo/*`

**Server:** Fastify 5, Node.js 22, FFmpeg (מסופק דרך `@ffmpeg-installer/ffmpeg`), AWS SDK v3 (S3/MinIO), `amqplib`, Zod, Sharp

**Observability:** מעקב + מטריקות OpenTelemetry, profiling של Pyroscope, logging של Pino (דרך `@ztube/observability`)

**כלים:** pnpm, Turborepo, Biome, TypeScript, Vitest, Playwright
