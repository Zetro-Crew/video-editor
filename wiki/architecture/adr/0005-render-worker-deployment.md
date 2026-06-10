# ADR 0005: הרצת רינדור על תור עמיד ו־Deployment של worker ייעודי

- סטטוס: התקבל
- תאריך: 2026-06-02

## קונטקסט

`POST /render` מריץ FFmpeg ב־process דרך closure של fire-and-forget על אותו
pod של Fastify שמשרת HTTP. שלוש בעיות מצטברות:

1. **קריסת pod באמצע רינדור — העבודה אבודה.** TTL של state ב־Redis פג; אין retry, אין
   resume.
2. **אין backpressure.** כל pod של API מקבל `202`s ללא הגבלה בעוד הסמפור של FFmpeg
   מכניס לתור פנימית; הזיכרון גדל ו־rollouts פגים.
3. **scale-down / rollout מפיל jobs.** כיבוי מבוקר לא ממתין ל־jobs
   כי אין רישום job.

ה־store של state ב־Redis (`RedisRenderJobStateAdapter`) ו־polling ל־`GET /render` הם
קוד מת מנקודת מבט הלקוח: ה־frontend מגיש את ה־job ולעולם לא עושה
polling. ערוץ התוצאה האמיתי הוא אירועי AMQP (`export.started` /
`export.completed` / `export.failed`) על topic exchange של `video-editor`
הקיים, נצרך על ידי מערכות חיצוניות.

## החלטה

העבר את הרצת הרינדור ל־quorum queue עמיד של RabbitMQ (`render.requested`)
שנצרך על ידי Deployment נפרד של `video-editor-worker` שנבנה מאותו
image עם entrypoint אחר (`src/worker.ts`). state רינדור של Redis ו־
`GET /render` נמחקים באותו שינוי; אירועים הופכים לערוץ התוצאה היחיד.

החלטות נעולות:

| נושא | החלטה |
|---|---|
| טווח | רינדור בלבד. הכנת מקור preview נשארת sync HTTP. |
| Broker | שימוש חוזר ב־RabbitMQ הקיים. |
| טופולוגיה | Deployment חדש `video-editor-worker`, אותו image, entrypoint נפרד `src/worker.ts`. |
| State store | השלך state של Redis ו־`GET /render` לחלוטין. אירועים הם ערוץ התוצאה היחיד. |
| טופולוגיית AMQP | direct exchange חדש `video-editor.commands`. תור `render.requested` (quorum, durable, `x-delivery-limit=5`, `x-overflow=reject-publish`, `x-max-length=10000`, `x-message-ttl` אופציונלי דרך env). DLX `video-editor.commands.dlx` → DLQ `render.dead`. אירועים נשארים ב־`video-editor`. תקציב = 5 כי כל SIGKILL במהלך רינדור ארוך נספר לעבר המגבלה; 3 צפוף מדי ל־rolling restarts. |
| `export.started` | יורה מ־worker בעת צריכה (לפני FFmpeg), לא מ־API. |
| Retry | broker מוסר מחדש אוטומטית עד 5 דרך `x-delivery-limit`. לאחר מיצוי → DLQ. |
| ערובת אירוע סופי | צרכן DLQ בתוך תהליך ה־worker: קורא `render.dead`, מפרסם `export.failed { error: "max retries exceeded" }`, עושה ack. |
| Concurrency של Worker | env `WORKER_CONCURRENCY`, ברירת מחדל 1. AMQP prefetch = `WORKER_CONCURRENCY`. |
| כיבוי | SIGTERM → בטל consumer → המתן לבטיסה עד deadline → drain publisher → סגור. K8s `terminationGracePeriodSeconds: 600`. |
| Payload | `Envelope<RenderRequested>` inline עם `data = { jobId, ...renderInput, exportType, saveMetadata? }`. Schema פנימי לשרת. |
| אמינות Producer | `publishCommand()` חדש משתמש ב־confirms וזורק בעת מיצוי. ה־controller תופס → 503. סבב timeout-של-confirm ניתן להגדרה דרך `COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS` (ברירת מחדל 10000 ms). publisher אירועים שומר על swallow-on-exhaustion. |
| Idempotency | לפני הרצת FFmpeg, ה־consumer עושה `storage.exists(outputKey)`; אם קיים, מפרסם `export.completed` עם ה־URL החתום הקיים + ack. מפתח פלט נגזר דטרמיניסטית מ־`jobId`. |

## חלופות שנשקלו

- **BullMQ / Redis Streams** — מוסיף substrate עמיד שני לצד
  אירועי RabbitMQ הקיימים. שני מצבי כשל לתפעל, יותר עלות ops ברשת
  סגורה. נדחה.
- **אותו exchange לפקודות ולאירועים** — מצמד fan-out של consumer:
  topic exchange של אירועים קשור על ידי צוותים חיצוניים; קשירת פקודה
  פנימית של שרת עליו תחשוף חוזים פנימיים. נדחה.
- **תור קלאסי עם TTL + DLX retry** — בר־קיום אבל אין מונה מסירה
  לכל הודעה; היינו צריכים לקודד retry-count ב־headers ולפרסם מחדש, מה
  שממציא מחדש את `x-delivery-limit`. נדחה לטובת quorum queue.
- **שמור state של Redis לנראות ops** — אין צרכן שנשאר
  (ה־frontend נטש polling), וזרם האירועים הוא הסיגנל הסמכותי.
  לשמור על זה רק יטעה את `knip`. נדחה.
- **מנוע Temporal / durable-workflow** — עלות ops של רשת סגורה, cluster
  נפרד, אין מומחיות מפעיל קיימת. נדחה; גישת ה־quorum-queue + DLX
  מספקת את רוב הערך היום.

## השלכות

- `export.started` עשוי לפרסם מספר פעמים עבור אותו `jobId` בעת
  מסירה מחדש — מנויים חייבים לבצע dedupe. ה־README של האירועים תוקן.
- `terminationGracePeriodSeconds: 600` משקף משך רינדור, לא טעות הקלדה.
  רינדורים שעולים על התקציב נכבים ב־SIGKILL; ההודעות שלהם נמסרות מחדש
  ל־worker אח. כל SIGKILL נספר לעבר `x-delivery-limit` (5).
- Idempotency מסתמך על מפתח פלט S3 דטרמיניסטי שנגזר מ־`jobId`.
  שינוי גזירת המפתח מבטל את הקיצור.
- מיגרציה אינה הפיכה לאחר שלב ה־cutover (Redis state adapter,
  לקוח Redis ו־`GET /render` נמחקים).
- שני entrypoints של image (`src/index.ts` ל־API, `src/worker.ts` ל־worker).
  אותה env-schema, אותו container; רק `command` / `args` שונים ב־K8s.
- `render.dead` שמצטבר ללא worker הוא P1: התראה על
  `render.dead.messages_ready > 0`.

## רצף מיגרציה

1. הצהרת טופולוגיה נוחתת ב־`RabbitMQPublisher.connect()` (מצהיר את
   ה־exchange, התור, ה־DLX החדשים). אין שינוי התנהגות.
2. קוד worker + מניפסט עם `replicas: 0`. `publishCommand()` נוסף אך לא
   נקרא.
3. Cutover (PR יחיד): controller עובר ל־`publishCommand` → 202/503, GET
   `/render` הוסר, Redis state adapter / port / client / env vars `REDIS_*` /
   `JOB_PROGRESS_TTL_SECONDS` הוסרו. `replicas: 1` ל־worker ב־staging באותו
   PR; אמת רינדור end-to-end לפני merge.
4. הגדל את `replicas` של worker ל־2 בייצור. עקוב אחר עומק תור של RabbitMQ ועומק DLQ.
5. כוונן את `WORKER_CONCURRENCY`, `x-max-length` ו־`RENDER_REQUEST_TTL_MS`
   האופציונלי בהתאם לתעבורה הנצפית.
