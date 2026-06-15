# server

`apps/server` · Fastify + Node.js · שני entrypoints, image אחד.

| Entrypoint | תהליך | פורט | תפקיד |
|---|---|---|---|
| `src/index.ts` | **API** | `4001` (`PORT`) | HTTP — uploads, preview, הכנסה לתור של רינדור |
| `src/worker.ts` | **Worker** | `8081` (`WORKER_PROBE_PORT`, probe + מטריקות) | צורך `render.requested`, מריץ FFmpeg, מפרסם אירועי `export.*` |

ה-API לא חוסם על רינדור. `POST /render` מחזיר `202 { id }` לאחר אישור broker; הלקוחות עוקבים דרך אירועי AMQP על topic exchange `video-editor`. ראה [ADR 0005](../adr-index).

TypeScript רץ ישירות ב-Node 22.18+. אין `tsx`, אין `ts-node`, אין שלב build בפיתוח.

## הרצה מקומית

```bash
docker compose up -d        # MinIO + RabbitMQ
pnpm install
cd apps/server
pnpm dev                    # node --watch על src/index.ts
node --env-file=.env src/worker.ts   # ה-Worker מול אותו .env
```

```bash
pnpm dev          # API ב-watch
pnpm start        # node src/index.ts (ייצור)
pnpm test         # vitest run
pnpm type-check   # tsc --noEmit
pnpm lint         # biome check . --write
```

## API

| Method | נתיב | תיאור |
|---|---|---|
| `GET` | `/health` | `{ status: "ok" }`. liveness probe. |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/openapi.json` | OpenAPI 3.0 spec |
| `POST` | `/upload/signed-url` | URL חתום ל-PUT של S3. הלקוח מעלה ישירות. `Content-Length` נצרב לחתימה. |
| `POST` | `/render` | מאמת design, מפרסם `render.requested`, מחזיר `202 { id }`. `503` אם broker לא מאשר. |
| `POST` | `/editor/preview-source` | בונה HLS preview ממקור (`channel-range` או `media-id`). מחזיר `{ playlistUrl, durationMs }`. |
| `GET` | `/editor/segment` | Proxy ל-segment בודד. מאמת HMAC, מזריק header upstream (`vod-token` ל-channel-range; עוגיית session ל-media-id). |

**אין `GET /render`.** ערוץ התוצאה היחיד הוא אירועי AMQP.

## ארכיטקטורה (Ports & Adapters)

```
src/
├── bootstrap/       # System, Worker, Server, DI container, shutdown
├── config/          # סכמת env של Zod (מקור האמת)
├── infrastructure/  # adapters משותפים: Fastify, FFmpeg, S3, AMQP
├── shared/          # טיפוסי domain ו-ports cross-feature
└── features/
    ├── upload/
    ├── render/
    └── preview/
        ├── adapters/
        │   ├── inbound/http/   # Fastify controllers
        │   ├── inbound/amqp/   # AMQP consumers (render בלבד)
        │   └── outbound/       # FFmpeg, S3, HTTP, AMQP
        ├── application/
        │   ├── use-cases/
        │   ├── ports/outbound/
        │   └── services/
        └── domain/
```

`src/bootstrap/container.ts` חושף `buildApiContainer` ו-`buildWorkerContainer`. ה-API מקבל controllers + `RenderCommandPort`; ה-Worker מקבל את ה-use case של FFmpeg ואת consumers של `render.requested` + `render.dead`.

## Worker — זרימה לכל הודעה

תורים: `render.requested` (quorum) + `render.dead` (DLQ).

1. פרס + Zod על המעטפת. הודעה רעילה → `export.failed { error: "invalid envelope" }` (אם `jobId` קביר) + ack. לא תימסר מחדש.
2. **Idempotency:** `storage.exists(outputKey)`. true → `export.completed` עם ה-URL הקיים + ack. בלי FFmpeg.
3. `export.started` (אם `saveMetadata` נוכח).
4. `VideoRenderUseCase.execute(...)`.
5. `export.completed` + ack.
6. כשל חולף: `nack(requeue=true)`. ה-broker עושה dead-letter ל-`render.dead` כש-`x-delivery-count > x-delivery-limit`. צרכן DLQ מפרסם `export.failed { error: "max retries exceeded" }` סופי.

מפתחות פלט דטרמיניסטיים: `<S3_OUTPUT_PREFIX>/<jobId>.<format>` (או `<S3_OUTPUT_PREFIX>/<jobId>` ל-`dash`). בדיקת ה-HEAD בשלב 2 מסתמכת על זה.

כיבוי Worker: בטל consumer → המתן עד 540s לעבודה בטיסה → drain publisher (5s) → סגור channel/connection → עצור probe. K8s `terminationGracePeriodSeconds: 600`.

## AMQP

| היבט | ערך |
|---|---|
| Events exchange | `video-editor` (topic, durable). Routing keys: `export.started`, `export.completed`, `export.failed`. |
| Commands exchange | `video-editor.commands` (direct, durable). Routing keys: `render.requested`. **פנימי לשרת.** |
| מעטפת | `{ eventName, eventVersion, occurredAt, traceparent, data }`. AMQP headers `x-event-name` ו-`x-event-version` משקפים את המעטפת. |
| Confirms | `confirmSelect` + `mandatory: true`. ack = הצלחה; nack או unrouted-return = כשל. |
| Retry (אירועים) | 3 ניסיונות, `100ms / 500ms / 2s`. מיצוי: log + בלע. ה-controller לא רואה את השגיאה. |
| Retry (פקודות) | אותו backoff + סבב confirm-timeout (`COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS`). מיצוי: `PublishExhaustedError` → `503`. |
| Reconnect | מובנה ב-amqplib 1.1+. `factor: 2`, `maxDelay: 30s`, `jitter: 0.2`, `maxRetries: Infinity`. ראה [ADR 0006](../adr-index). |
| אתחול | חיבור eager. Fail-fast אם broker לא נגיש (`AMQP_INITIAL_CONNECT_TIMEOUT_MS`). |

צוותים חיצוניים: [integrate/events](../../integrate/events).

## משתני env

מאומתים על ידי Zod ב-`src/config/env.ts` — מקור האמת. שלושה schemas: `commonEnvSchema`, `apiEnvSchema`, `workerEnvSchema`. מפתחות לא ידועים מוסרים בשקט.

### משותף

| משתנה | ברירת מחדל | תיאור |
|---|---|---|
| `SERVICE_NAME` | `video-editor-server` | שם השירות ל-logger/OTel |
| `SERVICE_VERSION` | `1.0.0` | גרסת השירות |
| `LOG_LEVEL` | `info` | רמת Pino |
| `OTEL_ENDPOINT` | אופציונלי | OTLP collector. OTel מושבת בלעדיו. |
| `FFMPEG_PRESET` | `veryfast` | preset של encoder |
| `FFMPEG_CRF` | `20` | איכות (נמוך יותר = טוב יותר) |
| `FFMPEG_AUDIO_BITRATE` | `192k` | bitrate אודיו |
| `FFMPEG_MAX_CONCURRENT` | `2` | תהליכי FFmpeg במקביל (semaphore) |
| `MIN_TRANSCODE_SEGMENT_SECONDS` | `0.35` | אורך segment מינימלי לפני transcode |
| `ENABLE_MPD_RESTRICTIONS` | `false` | אכיפת מגבלות על MPD multi-period/AS |
| `TRANSCODE_TIMEOUT_MS` | `7200000` | timeout קשה (2h) |
| `MAX_TEMP_FILE_SIZE_MB` | `5000` | גודל מקסימלי לקובץ זמני |
| `MPD_TRANSCODE_CRF_MULTI` | `10` | CRF למספר representations |
| `MPD_TRANSCODE_CRF_SINGLE` | `18` | CRF ל-representation יחיד |
| `MPD_TRANSCODE_PRESET` | `medium` | preset ל-MPD transcoding |
| `S3_BUCKET` | חובה | שם bucket |
| `S3_ENDPOINT` | חובה | URL endpoint |
| `S3_REGION` | `us-east-1` | אזור |
| `S3_FORCE_PATH_STYLE` | `true` | נדרש ל-MinIO |
| `S3_ACCESS_KEY_ID` | חובה | מפתח גישה |
| `S3_SECRET_ACCESS_KEY` | חובה | סוד |
| `S3_OUTPUT_PREFIX` | `output` | קידומת לפלט. **חייב להתאים בין API ל-Worker.** |
| `RENDER_URL_EXPIRY_SECONDS` | `86400` | TTL ל-URLs חתומים של פלט |
| `QUEUE_URL` | חובה | URL AMQP. `amqps://` מפעיל mTLS וקריאת `/bundle.pem` + `/tmp/certificates/rabbitmq/rabbit_{cert,key}.pem`. |
| `COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS` | `10000` | confirm-timeout לפקודות |
| `EVENT_PUBLISH_CONFIRM_TIMEOUT_MS` | `30000` | confirm-timeout לאירועים |
| `AMQP_INITIAL_CONNECT_TIMEOUT_MS` | `15000` | timeout חיבור AMQP ראשוני |
| `RENDER_REQUEST_TTL_MS` | אופציונלי | `x-message-ttl` על `render.requested` |

### API בלבד

| משתנה | ברירת מחדל | תיאור |
|---|---|---|
| `PORT` | `4001` | פורט HTTP |
| `HOST` | `127.0.0.1` | host של bind |
| `CORE_BASE_URL` | חובה | URL בסיס של Core (כולל `/private`). פיתוח: `http://localhost:8002/private` |
| `MOCK_VOD_BASE_URL` | `http://localhost:5050` | אתחול בלבד — fixture של mock-vod כש-Core מקומי |
| `SERVER_BASE_URL` | חובה | URL ציבורי של השרת. נצרב ל-URLs חתומים. |
| `PREVIEW_SIGNING_SECRET` | חובה | HMAC-SHA256, מינימום 32 תווים. בלעדיו: וקטור SSRF — השרת מסרב להתחיל. |
| `MAX_PREVIEW_DURATION_MS` | `3600000` | חלון preview מקסימלי (1h) |
| `PREVIEW_JOB_TTL_SECONDS` | `86400` | TTL ל-preview job |
| `S3_PREVIEW_PREFIX` | `preview` | קידומת ל-playlists/segments |
| `S3_UPLOAD_PREFIX` | `uploads` | קידומת ל-assets שהועלו |
| `UPLOAD_MAX_SIZE_BYTES` | `524288000` | 500 MB |
| `S3_AUTO_CREATE_BUCKET` | `true` | צור bucket אוטומטית אם חסר |

### Worker בלבד

| משתנה | ברירת מחדל | תיאור |
|---|---|---|
| `WORKER_CONCURRENCY` | `1` | AMQP prefetch + concurrency של רינדור |
| `WORKER_PROBE_PORT` | `8081` | פורט probe + מטריקות |

## מקורות

- `apps/server/README.md` ו-`apps/server/CLAUDE.md`
- `apps/server/src/config/env.ts` — מקור האמת ל-env
- Swagger UI: `${SERVER_BASE_URL}/docs`
