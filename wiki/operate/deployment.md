# פריסה

בנייה ופריסה של stack שרת ה-video-editor לרשת סגורה.

## טופולוגיה

image אחד, שתי deployments. אותה schema של env, רק `command`/`args` שונים ב-K8s. ה-DI container מפצל דרך `buildApiContainer` ו-`buildWorkerContainer` ב-`src/bootstrap/container.ts`. ראה [ADR 0005](../dev/adr-index).

| תהליך | Entrypoint | פורט | תפקיד |
|---|---|---|---|
| **API** | `node src/index.ts` | `4001` (HTTP) | מקבל uploads, משרת preview, **מכניס לתור** רינדור. מחזיר `202 { id }` ויוצא מהדרך. |
| **Worker** | `node src/worker.ts` | `8081` (probe + מטריקות Prometheus) | צורך `render.requested`, מריץ FFmpeg, מפרסם אירועי `export.*`. |

## בניית Image

`Dockerfile` בשורש. שלושה שלבים:

1. **`pruner`** — `turbo prune @video-editor/server --docker` מקטין את ה-workspace למה שהשרת צריך.
2. **`deps`** — `pnpm install --frozen-lockfile` מול המניפסטים המוקטנים, ואז `pnpm --filter @video-editor/server deploy --prod --legacy /prod/server`.
3. **`runtime`** — מעתיק את `/prod/server` עם UID 1001 / GID 0 (ידידותי ל-OpenShift), מריץ `node src/index.ts` כברירת מחדל. ה-Worker דורס את הפקודה ב-spec שלו.

```bash
docker build --build-arg NODE_IMAGE=<your-internal-node:22.18> \
  -t <your-registry.internal>/video-editor-server:<tag> .
docker push <your-registry.internal>/video-editor-server:<tag>
```

`NODE_IMAGE` הוא build arg ללא ברירת מחדל — בנייה ברשת סגורה תמיד נועלת על image בסיס פנימי מאומת. גם ה-API וגם ה-Worker מושכים את אותו image.

## מניפסטים של K8s

מניפסטים של ה-Worker ב-`deploy/worker/`. מניפסט ה-API ספציפי לסביבה ולא נכלל ב-commit.

| קובץ | מטרה |
|---|---|
| `deployment.yaml` | Worker Deployment — `command: ["node"]`, `args: ["src/worker.ts"]`, probes, מגבלות, anti-affinity, mTLS mounts |
| `service.yaml` | ClusterIP חושף probe + פורט מטריקות |
| `configmap.yaml` | env לא-סודי: probe port, כפתורי FFmpeg, S3 bucket/region/prefix, כיוונוני MPD transcode |

לפני הפעלה, ערוך:
- `metadata.namespace` בכל השלושה
- `containers[0].image` ב-`deployment.yaml`
- `S3_BUCKET` ו-`S3_ENDPOINT` ב-`configmap.yaml`
- שם `imagePullSecrets` אם ה-registry שלך משתמש בסוד אחר
- ה-`splunk::ztube` Collectord index אם ה-labels בסביבתך שונים

```bash
kubectl apply -f deploy/worker/configmap.yaml
kubectl apply -f deploy/worker/service.yaml
kubectl apply -f deploy/worker/deployment.yaml
```

## RabbitMQ

ייצור מדבר mTLS על `amqps://`. השרת מזהה את הסכמה וקורא שלושה PEMs באתחול:

| נתיב | מטרה | מקור K8s |
|---|---|---|
| `/bundle.pem` | bundle CA פרטי | `Secret/ssl-values`, מפתח `bundle.pem`, `subPath` |
| `/tmp/certificates/rabbitmq/rabbit_cert.pem` | תעודת לקוח | `Secret/rabbit-values`, מפתח `rabbit_cert.pem` |
| `/tmp/certificates/rabbitmq/rabbit_key.pem` | מפתח לקוח | `Secret/rabbit-values`, מפתח `rabbit_key.pem` |

`mode: 0400` בשלושתם. ה-AMQP URL לא נושא userinfo — broker מאמת לפי תעודה.

טופולוגיה שהשרת מצהיר בעת חיבור:

| Exchange | סוג | הערות |
|---|---|---|
| `video-editor` | topic | אירועים ציבוריים: `export.started`, `export.completed`, `export.failed` |
| `video-editor.commands` | direct | פנימי לשרת: `render.requested` |
| `video-editor.commands.dlx` | direct (DLX) | יעד dead-letter ל-`render.requested` |

| תור | סוג | הערות |
|---|---|---|
| `render.requested` | quorum, durable, `x-delivery-limit=5`, `x-overflow=reject-publish`, `x-max-length=10000` | `x-message-ttl` אופציונלי מ-`RENDER_REQUEST_TTL_MS` |
| `render.dead` | קשור ל-DLX | צרכן ה-DLQ ב-worker מפרסם `export.failed { error: "max retries exceeded" }` סופי |

## S3 / MinIO

כל אחסון תואם S3 מתאים. השרת משתמש בכתובות בסגנון נתיב (`S3_FORCE_PATH_STYLE=true`).

**יצירת bucket:**
- `S3_AUTO_CREATE_BUCKET=true` (ברירת מחדל) — ה-API יוצר אם חסר.
- `false` — צור מראש עם שם `S3_BUCKET`.

**CORS:** הגדר `MINIO_API_CORS_ALLOW_ORIGIN` (או המקבילה אצל הספק) לרשימת origins של הורים. הדפדפן מבצע PUT ישירות ל-MinIO דרך URLs חתומים. `docker-compose.yml` של פיתוח מגדיר `http://localhost:3000,http://localhost:8080`.

**Prefixes** (bucket אחד, שלושה שורשים לוגיים):

| Var | ברירת מחדל | שימוש |
|---|---|---|
| `S3_UPLOAD_PREFIX` | `uploads` | uploads ישירים (API בלבד) |
| `S3_PREVIEW_PREFIX` | `preview` | HLS playlists + segments (API בלבד) |
| `S3_OUTPUT_PREFIX` | `output` | פלט רינדור שכותב ה-Worker; ה-API קורא כדי לגזור מפתחות idempotency |

**`S3_OUTPUT_PREFIX` חייב להתאים בין API ל-Worker** — idempotency של רינדור תלויה במפתח דטרמיניסטי מ-`jobId`.

## Core + VOD במעלה הזרם

הגדר `CORE_BASE_URL` ל-`/private` של Core האמיתי. השרת מעביר את עוגיית `ztube-token` בכל קריאה ל-`/private/channels/:id/play`, `/private/media/:id/watch`, `/private/videos/:id/play`. ראה [ADR 0003](../dev/adr-index).

בייצור Core ו-VOD חולקים domain מאחורי reverse proxy. ה-mocks בפיתוח (`apps/core-mock`, `apps/mock-vod`) מחקים את אותו חוזה — ראה [ADR 0002](../dev/adr-index).

## env נדרש (חובה בייצור)

| Var | מטרה |
|---|---|
| `QUEUE_URL` | AMQP URL. `amqps://` מפעיל mTLS. גם API וגם Worker לא יתחילו בלעדיו. |
| `S3_BUCKET` / `S3_ENDPOINT` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | חיבור S3 |
| `SERVER_BASE_URL` | URL ציבורי של ה-API. נצרב ל-URLs חתומים. |
| `PREVIEW_SIGNING_SECRET` | HMAC-SHA256, מינימום 32 תווים. **בלעדיו ה-segment proxy = SSRF — השרת מסרב להתחיל.** |
| `CORE_BASE_URL` | URL בסיס `/private` של Core במעלה הזרם |

כפתורים אופציונליים מפורטים ב-[dev/apps/server](../dev/apps/server).

## בריאות ומוכנות

| תהליך | נתיב | פורט |
|---|---|---|
| API | `GET /health` | `PORT` (`4001`) |
| Worker | `GET /health`, `GET /ready` | `WORKER_PROBE_PORT` (`8081`) |
| Worker (מטריקות) | `GET /metrics` (Prometheus) | `WORKER_PROBE_PORT` |

הגדרות probes ב-`deployment.yaml` הקיים:

| Probe | initialDelay | period | failureThreshold |
|---|---|---|---|
| readiness | 5s | 5s | 3 |
| liveness | 30s | 30s | 3 |

> **שים לב:** `configmap.yaml` ה-committed מגדיר `WORKER_PROBE_PORT: "8080"` בעוד `deployment.yaml` חושף `containerPort: 8081`. בחר ערך אחד ותאם בין הקבצים לפני פריסה.

## כיבוי מבוקר

- **API.** עצור HTTP → publisher `drain(5s)` → publisher `close()`. ה-`close()` מבטל reconnect timers ממתינים ודוחה ממתינים בטיסה.
- **Worker.** בטל consumer → המתן לרינדור בטיסה עד ~540s → publisher `drain(5s)` → publisher `close()` → עצור probe.
- K8s: `terminationGracePeriodSeconds: 600` ב-Worker. רינדורים שעוברים את התקציב נכבים ב-SIGKILL; ההודעות נמסרות מחדש ל-worker אח. כל SIGKILL נספר לעבר `x-delivery-limit=5`.

## תזכורות לרשת סגורה

- FFmpeg מסופק דרך `@ffmpeg-installer/ffmpeg` — אין תלות ב-FFmpeg של מערכת.
- אין CDN ציבורי ב-HTML/JS המוגש.
- כל URL במעלה הזרם (Core, VOD, S3, RabbitMQ, OTel collector, Pyroscope) חייב להיות נגיש מתוך הרשת.
- אין משיכת חבילות בזמן ריצה — `pnpm install` רץ רק מול ה-registry הפנימי.

## מקורות

- `deploy/worker/` במאגר
- `apps/server/CLAUDE.md`
- [dev/apps/server](../dev/apps/server) — פירוט מלא של env
