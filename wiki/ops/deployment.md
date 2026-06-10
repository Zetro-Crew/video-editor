# פריסה

איך לבנות ולפרוס את ה־stack של שרת video-editor לרשת סגורה ומבודדת.

## טופולוגיה

container image אחד, שתי deployments:

| תהליך | Entrypoint | פורט | תפקיד |
|---|---|---|---|
| **API** | `node src/index.ts` | `4001` (HTTP) | מקבל העלאות, משרת בקשות preview, **מכניס לתור** פקודות רינדור על RabbitMQ. מחזיר `202 { id }` ויוצא מהדרך. |
| **Worker** | `node src/worker.ts` | `8081` (probe + מטריקות Prometheus) | צורך את התור `render.requested`, מריץ FFmpeg, מפרסם אירועי `export.*`. |

אותו image, אותה schema של env. רק `command`/`args` שונים ב־K8s. ה־DI container מפצל ביניהם דרך `buildApiContainer` ו־`buildWorkerContainer` ב־`src/bootstrap/container.ts`. ראה [ADR 0005](../architecture/adr/0005-render-worker-deployment) לסיבה.

## בניית Image

`Dockerfile` בשורש המאגר. שלושה שלבים:

1. **`pruner`** — מריץ `turbo prune @video-editor/server --docker` כדי להקטין את ה־workspace למה שהשרת צריך (בתוספת חבילות workspace טרנזיטיביות שלו).
2. **`deps`** — `pnpm install --frozen-lockfile` מול המניפסטים המוקטנים, אחר כך `pnpm --filter @video-editor/server deploy --prod --legacy /prod/server` כדי לחומר תלויות ייצור בלבד תחת `/prod/server`.
3. **`runtime`** — מעתיק את `/prod/server` עם UID 1001 / GID 0 (ידידותי ל־OpenShift), מריץ `node src/index.ts` כברירת מחדל. ה־worker דורס את הפקודה ב־K8s spec שלו.

בנייה:

```bash
docker build --build-arg NODE_IMAGE=<your-internal-node:22.18> \
  -t <your-registry.internal>/video-editor-server:<tag> .
```

`NODE_IMAGE` הוא build arg — הצבע אותו על image בסיס פנימי של Node 22.18+. אין ברירת מחדל; בנייה של רשת סגורה תמיד נועלת על image פנימי מאומת.

דחיפה ל־registry הפנימי שלך:

```bash
docker push <your-registry.internal>/video-editor-server:<tag>
```

גם ה־API וגם ה־Worker deployments מושכים את אותו image.

## מניפסטים של K8s

מניפסטים של Worker נמצאים ב־[`deploy/worker/`](https://example.invalid/deploy/worker/) במאגר. הם מכסים רק את ה־worker; מניפסט ה־API הוא ספציפי לסביבה ולא נכלל ב־commit.

| קובץ | מטרה |
|---|---|
| `deployment.yaml` | Deployment של ה־Worker — `command: ["node"]`, `args: ["src/worker.ts"]`, probes, מגבלות משאבים, anti-affinity, mTLS volume mounts |
| `service.yaml` | ClusterIP שחושף את ה־probe + פורט המטריקות |
| `configmap.yaml` | env לא-סודי: probe port, כפתורי FFmpeg, S3 bucket/region/prefix, כיוונוני transcode של MPD |

שדות שצריך לערוך לפני הפעלה:

- `metadata.namespace` (כל שלושת הקבצים)
- `containers[0].image` ב־`deployment.yaml`
- `S3_BUCKET` ו־`S3_ENDPOINT` ב־`configmap.yaml`
- שם ה־`imagePullSecrets` אם אתה משתמש בסוד אחר ל־registry הפנימי שלך
- ה־`splunk::ztube` Collectord index אם הסביבה שלך משתמשת ב־labels אחרים ללוגים

הפעלה:

```bash
kubectl apply -f deploy/worker/configmap.yaml
kubectl apply -f deploy/worker/service.yaml
kubectl apply -f deploy/worker/deployment.yaml
```

## תשתיות נדרשות

### RabbitMQ

הייצור חייב לדבר mTLS על `amqps://`. השרת מזהה את הסכמה וקורא שלושה קבצי PEM באתחול:

| נתיב | מטרה | מקור K8s ב־`deploy/worker/deployment.yaml` |
|---|---|---|
| `/bundle.pem` | bundle CA פרטי | `Secret/ssl-values`, מפתח `bundle.pem`, מותקן ב־`subPath` |
| `/tmp/certificates/rabbitmq/rabbit_cert.pem` | תעודת לקוח | `Secret/rabbit-values`, מפתח `rabbit_cert.pem` |
| `/tmp/certificates/rabbitmq/rabbit_key.pem` | מפתח לקוח | `Secret/rabbit-values`, מפתח `rabbit_key.pem` |

`mode: 0400` בשלושתם. ה־AMQP URL לא נושא userinfo — ה־broker מאמת לקוחות לפי תעודה.

השרת מצהיר על טופולוגיית AMQP בעת חיבור:

| Exchange | סוג | הערות |
|---|---|---|
| `video-editor` | topic | אירועים ציבוריים: `export.started`, `export.completed`, `export.failed` |
| `video-editor.commands` | direct | פנימי לשרת: `render.requested` |
| `video-editor.commands.dlx` | direct (DLX) | יעד dead-letter עבור `render.requested` |

תורים:

| תור | סוג | הערות |
|---|---|---|
| `render.requested` | quorum, durable, `x-delivery-limit=5`, `x-overflow=reject-publish`, `x-max-length=10000` | `x-message-ttl` אופציונלי מ־`RENDER_REQUEST_TTL_MS` |
| `render.dead` | מקושר ל־DLX | צרכן DLQ ב־worker מפרסם `export.failed { error: "max retries exceeded" }` סופי |

### S3 / MinIO

כל אחסון אובייקטים תואם S3 עובד. השרת משתמש בכתובות בסגנון נתיב (`S3_FORCE_PATH_STYLE=true`) כך שהוא מדבר עם MinIO מוכן לעבודה.

איפוס Bucket:

- אם `S3_AUTO_CREATE_BUCKET=true` (ברירת מחדל), ה־API יוצר את ה־bucket באתחול אם חסר.
- אחרת צור אותו מראש עם שם ה־`S3_BUCKET` המוגדר.

CORS:

- הגדר את `MINIO_API_CORS_ALLOW_ORIGIN` (או המקבילה אצל הספק שלך) לרשימה מופרדת בפסיקים של origins של הורים. דפדפנים מבצעים PUT של קבצים ישירות ל־MinIO דרך URLs מסומנים.
- ה־`docker-compose.yml` של פיתוח מקומי מגדיר את זה ל־`http://localhost:3000,http://localhost:8080` כתבנית.

Prefixes (bucket אחד, שלושה שורשים לוגיים):

| Var | ברירת מחדל | בשימוש על ידי |
|---|---|---|
| `S3_UPLOAD_PREFIX` | `uploads` | העלאות ישירות ל־S3 (API בלבד) |
| `S3_PREVIEW_PREFIX` | `preview` | playlists של HLS preview + segments (API בלבד) |
| `S3_OUTPUT_PREFIX` | `output` | פלט רינדור שנכתב על ידי Worker; ה־API קורא כדי לגזור מפתחות אידמפוטנטיים |

**`S3_OUTPUT_PREFIX` חייב להתאים בין API ל־Worker** — אידמפוטנטיות הרינדור תלויה במפתח דטרמיניסטי שנגזר מ־`jobId`.

### שירותי Core + VOD במעלה הזרם

הגדר את `CORE_BASE_URL` ל־base URL של `/private` של שירות Core האמיתי (שרת העורך מוסיף נתיבי route אליו). השרת מעביר את עוגיית `ztube-token` שהוא מקבל מאפליקציית ההורה בכל קריאה ל־`/private/channels/:id/play`. ראה [ADR 0003](../architecture/adr/0003-iframe-auth-via-httponly-cookie).

בייצור, Core ו־VOD חולקים domain מאחורי reverse proxy. ה־mocks בפיתוח (`apps/core-mock`, `apps/mock-vod`) מחקים את אותו חוזה HTTP — ראה [ADR 0002](../architecture/adr/0002-mock-vod-as-separate-app).

## env נדרש (חובה בייצור)

| Var | מטרה |
|---|---|
| `QUEUE_URL` | AMQP URL. `amqps://…` מפעיל mTLS. גם ה־API וגם ה־Worker לא יתחילו בלעדיו. |
| `S3_BUCKET` / `S3_ENDPOINT` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | חיבור S3. |
| `SERVER_BASE_URL` | URL ציבורי של ה־API. נצרב לתוך URLs חתומים של segments. |
| `PREVIEW_SIGNING_SECRET` | סוד HMAC-SHA256 (מינימום 32 תווים) לחתימת `/editor/segment`. **בלעדיו ה־proxy הוא וקטור SSRF — השרת מסרב להתחיל.** |
| `CORE_BASE_URL` | URL בסיס `/private` של Core במעלה הזרם. |

כפתורים אופציונליים (ברירות מחדל סבירות לרוב הפריסות) מפורטים ב־[architecture/apps/server](../architecture/apps/server).

## בריאות ומוכנות

שני התהליכים חושפים probes:

| תהליך | נתיב | פורט |
|---|---|---|
| API | `GET /health` | `PORT` (`4001`) |
| Worker | `GET /health`, `GET /ready` | `WORKER_PROBE_PORT` (`8081`) |
| Worker (מטריקות) | `GET /metrics` (Prometheus) | `WORKER_PROBE_PORT` |

הגדרות probes של Worker שבשימוש ב־`deployment.yaml` ה־committed:

| Probe | initialDelay | period | failureThreshold |
|---|---|---|---|
| readiness | 5s | 5s | 3 |
| liveness | 30s | 30s | 3 |

> **שים לב:** ה־`configmap.yaml` ה־committed מגדיר `WORKER_PROBE_PORT: "8080"` בעוד ש־`deployment.yaml` חושף `containerPort: 8081`. החלט על ערך אחד ותאם את שניהם לפני הפריסה. הדף הזה לא קובע מה נכון — בדוק את הערך הנוכחי של הצוות שלך.

## כיבוי מבוקר

- **API.** עצור HTTP → publisher `drain(5s)` → publisher `close()`. ה־`close()` של ה־publisher מבטל כל reconnect timer ממתין ודוחה ממתינים בטיסה.
- **Worker.** בטל את צרכן ה־AMQP → המתן לרינדור בטיסה עד ~540s → publisher `drain(5s)` → publisher `close()` → עצור את שרת ה־probe.
- K8s: `terminationGracePeriodSeconds: 600` ב־worker. מותאם למשך הרינדור. רינדורים שעולים על התקציב נכבים ב־`SIGKILL`; ההודעות שלהם נמסרות מחדש ל־worker אח. כל SIGKILL נספר לעבר `x-delivery-limit=5`.

## תזכורות לרשת סגורה

- חבר הכול. FFmpeg מסופק דרך `@ffmpeg-installer/ffmpeg`; אין תלות ב־FFmpeg של המערכת.
- אין קישורי CDN ציבוריים ב־HTML/JS שמשרתים.
- כל ה־URLs במעלה הזרם (Core, VOD, S3, RabbitMQ, OTel collector, Pyroscope) חייבים להיות נגישים מתוך הרשת.
- אין משיכות חבילות חיצוניות בזמן ריצה — `pnpm install` רץ רק מול ה־registry הפנימי שלך.
