# `@video-editor/server`

backend מבוסס Fastify + Node.js לעורך הווידאו. מטפל בהעלאות, רינדור FFmpeg וגישור preview של HLS. נבנה לפריסת רשת סגורה — FFmpeg מסופק, S3 self-hosted (MinIO) ו־RabbitMQ.

---

## סקירה

שני entrypoints, image אחד:

| Entrypoint | תהליך | פורט | מטרה |
|---|---|---|---|
| `src/index.ts` | **API** | `4001` (env `PORT`) | HTTP בלבד — העלאות, preview, הכנסה לתור של פקודות רינדור |
| `src/worker.ts` | **Worker** | `8081` (env `WORKER_PROBE_PORT`, probe + מטריקות Prometheus) | צורך `render.requested`, מריץ FFmpeg, מפרסם אירועי `export.*` |

ה־API לעולם לא חוסם על רינדור. `POST /render` מחזיר `202 { id }` אחרי שה־broker מאשר את הפקודה; הלקוחות עוקבים אחר מחזור החיים דרך אירועי AMQP (`export.started`, `export.completed`, `export.failed`) שמפורסמים ב־topic exchange של `video-editor`.

> [!NOTE]
> TypeScript מורץ ישירות על ידי Node.js 22.18+. אין `tsx`, אין `ts-node`, אין שלב build בפיתוח.

## תחילת עבודה מהירה

### דרישות מקדימות

- Node.js `22.18+`
- pnpm
- Docker (עבור MinIO + RabbitMQ)

### הרצה מקומית

```bash
# From repo root — starts MinIO + RabbitMQ
docker compose up -d

# Install workspace deps
pnpm install

# Start the API in watch mode
cd apps/server
pnpm dev
```

ה־API מאזין ל־`http://127.0.0.1:4001`. להרצת ה־worker מול אותו `.env`:

```bash
node --env-file=.env src/worker.ts
```

### פקודות

```bash
pnpm dev          # node --env-file=.env --watch-path=./src src/index.ts
pnpm start        # node src/index.ts (production API)
pnpm test         # vitest run
pnpm type-check   # tsc --noEmit
pnpm lint         # biome check . --write
```

## API

`GET /health` — `{ status: "ok" }`. בשימוש ב־liveness probe של k8s. נרשם ישירות ב־`Server.start()`.

### העלאה

| Method | נתיב | תיאור |
|---|---|---|
| `POST` | `/upload/signed-url` | מחזיר URL חתום ל־PUT של S3. הלקוח מעלה את הקובץ ישירות ל־MinIO/S3. `Content-Length` נצרב לתוך ה־URL החתום כך ש־S3 דוחה העלאות שלא מתאימות. |

### רינדור

| Method | נתיב | תיאור |
|---|---|---|
| `POST` | `/render` | מאמת את ה־payload של ה־design, מפרסם פקודת `render.requested`, מחזיר `202 { id }`. מחזיר `503` אם ה־broker לא מאשר אחרי ניסיונות חוזרים. |

> [!IMPORTANT]
> **אין endpoint של `GET /render`**. לקוחות מקבלים עדכוני מחזור חיים על ידי קישור תור ל־exchange של `video-editor` וצריכת `export.started` / `export.completed` / `export.failed`.

### Preview

| Method | נתיב | תיאור |
|---|---|---|
| `POST` | `/editor/preview-source` | מייצר preview של HLS מ־`channel-range` של Core. קורא ל־`/private/channels/:id/play` של Core, מושך את ה־MPD באמצעות `vod-token`, בונה playlist, מחזיר URL חתום של playlist. |
| `GET` | `/editor/segment` | proxy לסגמנט HLS יחיד. מאמת את חתימת ה־HMAC, ואז מושך מחדש את ה־segment במעלה הזרם עם header של `vod-token` מוזרק (דפדפנים לא יכולים להגדיר headers על בקשות HLS). |

## ארכיטקטורה

הקסגונלית (Ports & Adapters). כל תכונה עצמאית:

```
src/
├── bootstrap/          # System, Worker, Server, DI container, shutdown
├── config/             # Zod-validated env schema (source of truth)
├── infrastructure/     # Shared adapters: Fastify, FFmpeg, S3, AMQP
├── shared/             # Cross-feature domain types + ports
└── features/
    ├── upload/
    ├── render/
    └── preview/
        ├── adapters/
        │   ├── inbound/http/   # Fastify controllers
        │   ├── inbound/amqp/   # AMQP consumers (render only)
        │   └── outbound/       # FFmpeg, S3, HTTP, AMQP
        ├── application/
        │   ├── use-cases/
        │   ├── ports/outbound/
        │   └── services/
        └── domain/
```

`src/bootstrap/container.ts` חושף `buildApiContainer` ו־`buildWorkerContainer`. ה־API מקבל את ה־controllers של HTTP + `RenderCommandPort`; ה־worker מקבל את ה־use case של FFmpeg + את ה־consumers של `render.requested` ו־`render.dead`.

ראה [`CLAUDE.md`](./) למפת צלילה לעומק של קבצים, consumers וסמנטיקה של shutdown.

## Worker

אותו image, entrypoint `src/worker.ts`. קשור לשני תורים:

| תור | סוג | התנהגות |
|---|---|---|
| `render.requested` | quorum, durable, `x-delivery-limit=5`, `x-overflow=reject-publish`, `x-max-length=10000` | consumer ראשי — מריץ FFmpeg, מפרסם `export.completed` |
| `render.dead` | קשור ל־DLX | מפרסם `export.failed { error: "max retries exceeded" }` סופי עבור jobs שעוברים את מגבלת המסירה |

זרימה לכל הודעה ב־`render.requested`:

1. פרס → אמת Zod את המעטפת. הודעות poison מפרסמות `export.failed { error: "invalid envelope" }` (אם `jobId` ניתן לשחזור) ועושות ack — הן לא חייבות להימסר מחדש.
2. **קיצור Idempotency:** `storage.exists(outputKey)`. אם true, פרסם `export.completed` עם ה־URL החתום הקיים ועשה ack. דלג על FFmpeg.
3. פרסם `export.started` (רק כש־`saveMetadata` קיים בפקודה).
4. הרץ `VideoRenderUseCase.execute(...)`.
5. פרסם `export.completed`, עשה ack.
6. בעת כשל חולף: `nack(requeue=true)`. ה־broker שולח ל־dead-letter ל־`render.dead` ברגע ש־`x-delivery-count` עולה על `x-delivery-limit`.

מפתחות פלט הם דטרמיניסטיים מ־`jobId` (`<S3_OUTPUT_PREFIX>/<jobId>.<format>`, או `<S3_OUTPUT_PREFIX>/<jobId>` עבור `dash`). בדיקת ה־HEAD בשלב 2 מסתמכת על זה.

כיבוי Worker מבטל את ה־consumers, ממתין עד 540s לעבודה בטיסה, מסיים את ה־publisher (5s), סוגר channels + connections, ואז עוצר את שרת ה־probe. K8s `terminationGracePeriodSeconds: 600`.

## הודעות (RabbitMQ)

שני exchanges עמידים, מוצהרים ב־`connect()`:

| היבט | ערך |
|---|---|
| Events exchange | `video-editor` (topic, durable). Routing keys: `export.started`, `export.completed`, `export.failed` |
| Commands exchange | `video-editor.commands` (direct, durable). Routing keys: `render.requested`. **פנימי לשרת — לא חלק מהחוזה הציבורי.** |
| מעטפת | `{ eventName, eventVersion, occurredAt, traceparent, data }`. AMQP headers `x-event-name` ו־`x-event-version` משקפים את המעטפת כך שמנויים יכולים לסנן בלי לפרסר JSON |
| Confirms | `confirmSelect` + `mandatory: true`. broker-ack = הצלחה; broker-nack או unrouted-return = כשל |
| Retry (אירועים) | 3 ניסיונות, backoff `100ms / 500ms / 2s`. לאחר מיצוי: log + **בליעה** — ה־controller לעולם לא רואה את השגיאה |
| Retry (פקודות) | אותו backoff בתוספת סבב timeout-של-confirm לכל ניסיון (`COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS`). לאחר מיצוי: זורק `PublishExhaustedError` → ה־controller ממפה ל־`503` |
| Reconnect | לולאת רקע ב־close/error. Backoff `1s/2s/5s/10s`, מוגבל ל־30s. עוצר ב־`close()` מפורש |
| אתחול | חיבור eager ב־`System.start()` / `Worker.start()`. Fail-fast אם broker לא נגיש |

צוותים חיצוניים נרשמים לאירועים על ידי קישור התור שלהם ל־exchange של `video-editor` וייבוא סכמות מ־`@video-editor/contract/events`. ראה [event-consumers](../../integrators/event-consumers) לפרטי מעטפת, דוגמאות קישור ומדיניות גרסאות.

## סביבה

כל המשתנים מאומתים על ידי Zod ב־[`src/config/env.ts`](./src/config/env.ts) — הקובץ הזה הוא מקור האמת. ה־schema מפוצל לשלושה אובייקטי Zod: `commonEnvSchema` (נטען על ידי שני התהליכים), `apiEnvSchema` (מרחיב את common, נטען על ידי `parseApiEnv()`) ו־`workerEnvSchema` (מרחיב את common, נטען על ידי `parseWorkerEnv()`). מפתחות env לא ידועים מוסרים בשקט.

## משותף (גם API וגם Worker)

### Observability

| משתנה | ברירת מחדל | תיאור |
|---|---|---|
| `SERVICE_NAME` | `video-editor-server` | שם השירות של Logger / OTel |
| `SERVICE_VERSION` | `1.0.0` | גרסת השירות של Logger / OTel |
| `LOG_LEVEL` | `info` | רמת log של Pino |
| `OTEL_ENDPOINT` | אופציונלי | endpoint של OTel collector. OTel מושבת כשחסר |

### FFmpeg / transcoding

| משתנה | ברירת מחדל | תיאור |
|---|---|---|
| `FFMPEG_PRESET` | `veryfast` | preset של encoder |
| `FFMPEG_CRF` | `20` | איכות (נמוך יותר = טוב יותר) |
| `FFMPEG_AUDIO_BITRATE` | `192k` | bitrate של אודיו |
| `FFMPEG_MAX_CONCURRENT` | `2` | מקסימום תהליכי FFmpeg במקביל — מניע את ה־semaphore של `FfmpegRunner` שמחווט דרך DI |
| `MIN_TRANSCODE_SEGMENT_SECONDS` | `0.35` | אורך segment מינימלי לפני transcoding |

### MPD / transcoding של מקור

| משתנה | ברירת מחדל | תיאור |
|---|---|---|
| `ENABLE_MPD_RESTRICTIONS` | `false` | החל מגבלות כש־MPD הוא multi-period/multi-AS |
| `TRANSCODE_TIMEOUT_MS` | `7200000` | timeout קשה של MPD/HLS/audio transcode (2h) |
| `MAX_TEMP_FILE_SIZE_MB` | `5000` | מגבלת גודל קובץ זמני של MPD transcode |
| `MPD_TRANSCODE_CRF_MULTI` | `10` | CRF כש־MPD יש לו מספר representations |
| `MPD_TRANSCODE_CRF_SINGLE` | `18` | CRF כש־MPD יש לו representation יחיד |
| `MPD_TRANSCODE_PRESET` | `medium` | preset של FFmpeg ל־MPD transcoding |

### S3 / MinIO (חיבור משותף)

| משתנה | ברירת מחדל | תיאור |
|---|---|---|
| `S3_BUCKET` | חובה | שם bucket |
| `S3_ENDPOINT` | חובה | URL endpoint |
| `S3_REGION` | `us-east-1` | אזור |
| `S3_FORCE_PATH_STYLE` | `true` | כתובות בסגנון נתיב (נדרש ל־MinIO) |
| `S3_ACCESS_KEY_ID` | חובה | מפתח גישה |
| `S3_SECRET_ACCESS_KEY` | חובה | סוד |
| `S3_OUTPUT_PREFIX` | `output` | קידומת מפתח לפלט רינדור. **ה־Worker כותב; ה־API גוזר מפתחות idempotency.** חייב להתאים בין שני ה־pods |
| `RENDER_URL_EXPIRY_SECONDS` | `86400` | TTL ל־URLs חתומים של פלט רינדור |

### הודעות

| משתנה | ברירת מחדל | תיאור |
|---|---|---|
| `QUEUE_URL` | חובה | URL חיבור AMQP — גם ה־API וגם ה־worker לא יתחילו בלעדיו. `amqps://` מפעיל mTLS: התהליך קורא את `/bundle.pem` (CA) + `/tmp/certificates/rabbitmq/rabbit_{cert,key}.pem` באתחול |
| `COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS` | `10000` | timeout של אישור broker לכל ניסיון עבור `publishCommand` (3 ניסיונות; מיצוי → 503). משותף כי שני התהליכים חולקים את `buildPublisher()` |
| `EVENT_PUBLISH_CONFIRM_TIMEOUT_MS` | `30000` | timeout של אישור broker לכל ניסיון לפרסום אירועים |
| `AMQP_INITIAL_CONNECT_TIMEOUT_MS` | `15000` | timeout של חיבור AMQP ראשוני |
| `RENDER_REQUEST_TTL_MS` | אופציונלי | אם מוגדר, `x-message-ttl` על תור `render.requested`. משותף כי שני התהליכים מצהירים על טופולוגיה |

## API בלבד

| משתנה | ברירת מחדל | תיאור |
|---|---|---|
| `PORT` | `4001` | פורט HTTP |
| `HOST` | `127.0.0.1` | host של bind |
| `CORE_BASE_URL` | חובה | URL בסיס של Core במעלה הזרם. **כולל את הקידומת `/private`.** פיתוח: `http://localhost:8002/private` |
| `MOCK_VOD_BASE_URL` | אופציונלי | אתחול בלבד — מתעד את חלון ה־fixture הפעיל של mock-vod כש־`CORE_BASE_URL` הוא localhost. ברירת מחדל היא `http://localhost:5050` |
| `SERVER_BASE_URL` | חובה | URL ציבורי של שרת — בשימוש ב־URLs חתומים של segments |
| `PREVIEW_SIGNING_SECRET` | חובה | סוד HMAC-SHA256 לחתימת URL של `/editor/segment`. מינימום 32 תווים. בלעדיו ה־segment proxy יהיה וקטור SSRF |
| `MAX_PREVIEW_DURATION_MS` | `3600000` | אורך חלון preview מקסימלי (1h) |
| `PREVIEW_JOB_TTL_SECONDS` | `86400` | TTL להחזקת job של preview |
| `S3_PREVIEW_PREFIX` | `preview` | קידומת מפתח ל־playlists של preview/segments |
| `S3_UPLOAD_PREFIX` | `uploads` | קידומת מפתח ל־assets שהועלו |
| `UPLOAD_MAX_SIZE_BYTES` | `524288000` | גודל העלאה מקסימלי מקובל (500 MB). נאכף בצד השרת ונצרב לתוך ה־PUT החתום |
| `S3_AUTO_CREATE_BUCKET` | `true` | צור bucket אוטומטית באתחול API אם חסר |

## Worker בלבד

| משתנה | ברירת מחדל | תיאור |
|---|---|---|
| `WORKER_CONCURRENCY` | `1` | AMQP prefetch + concurrency של רינדור בתוך תהליך |
| `WORKER_PROBE_PORT` | `8081` | פורט probe + מטריקות |

## טסטים

Vitest. קבצי טסט co-located כ־`*.test.ts`.

```bash
pnpm test
```

טסטי AMQP של רינדור משתמשים ב־[`@testcontainers/rabbitmq`](https://github.com/testcontainers/testcontainers-node) — Docker חייב לרוץ.

## פריסה

`Dockerfile` יחיד בונה את שני ה־entrypoints. ה־image מתפרסם פעם אחת; ה־API וה־worker הם Deployments נפרדים שנבדלים רק ב־`CMD`. מניפסטים של Worker חיים ב־[`../../deploy/worker/`](../../deploy/worker/) — ראה [ADR 0005](../adr/0005-render-worker-deployment).

> [!WARNING]
> שרת זה מתוכנן ל**פריסת רשת סגורה**. FFmpeg מסופק דרך `@ffmpeg-installer/ffmpeg`; S3 מסופק על ידי MinIO self-hosted; RabbitMQ self-hosted. אל תוסיף תלויות שמושכות מ־URLs ציבוריים בזמן ריצה.

## תלויות מרכזיות

| חבילה | מטרה |
|---|---|
| `fastify` v5 | framework של HTTP |
| `amqplib` v2 | לקוח AMQP (אירועים + פקודות) |
| `@aws-sdk/*` | לקוח S3 / MinIO |
| `@ffmpeg-installer/ffmpeg` + `ffprobe-static` | binaries מסופקים של FFmpeg/ffprobe; מופעלים דרך `spawn` גולמי |
| `sharp` | עיבוד תמונה (SVG → PNG ל־overlays) |
| `zod` + `fastify-type-provider-zod` | אימות env + סכמת בקשה |
| `@video-editor/contract` | סכמות בקשה משותפות של HTTP + חוזי מעטפת AMQP |
| `@ztube/observability` | logger Pino, אינסטרומנטציה אוטומטית של OTel, Pyroscope |
