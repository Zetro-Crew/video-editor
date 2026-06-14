# צרכני אירועים

שרת העורך מפרסם אירועי מחזור-חיים של job רינדור ל־topic exchange יחיד של RabbitMQ. צוותים חיצוניים מקשרים תור משלהם אליו וצורכים.

## התקנה

```bash
pnpm add @video-editor/contract@<version> amqplib
```

נעל את שתי הגרסאות. `@video-editor/contract` מסופקת מה־registry הפנימי שלך — התקן אותה כמו כל תלות פנימית אחרת. **אל תשכפל את המאגר הזה כדי לצרוך אותה.**

ייבא רק את ה־subpath הציבורי של האירועים:

```ts
import {
  EXCHANGE_NAME,
  EXPORT_STARTED,
  EXPORT_COMPLETED,
  EXPORT_FAILED,
  X_EVENT_NAME,
  X_EVENT_VERSION,
  exportStartedEnvelopeSchema,
  exportCompletedEnvelopeSchema,
  exportFailedEnvelopeSchema,
  type ExportStartedData,
  type ExportCompletedData,
  type ExportFailedData,
} from "@video-editor/contract/events";
```

## Exchange + routing keys

| שדה | ערך |
|---|---|
| Exchange | `video-editor` |
| Type | topic |
| Durable | כן |

| Routing key | אירוע |
|---|---|
| `export.started` | job רינדור התחיל (FFmpeg עומד לרוץ) |
| `export.completed` | פלט הרינדור הועלה לאחסון; URL חתום ב־payload |
| `export.failed` | job רינדור נכשל (שגיאות חולפות מנוסות מחדש על ידי ה־broker; הכישלון הסופי נושא `error: "max retries exceeded"`) |

קשור את התור שלך עם `export.#` כדי לקבל את שלושת האירועים, או עם `export.completed` (וכו') כדי לסנן.

## מבנה המעטפת

כל גוף הודעה הוא אותה מעטפת. סוג התוכן של הגוף הוא `application/json`. `persistent: true` (delivery-mode 2).

```ts
type Envelope<T> = {
  eventName: string;       // matches routing key, e.g. "export.completed"
  eventVersion: number;    // schema version (current: 1 for all events)
  occurredAt: string;      // ISO-8601 UTC
  traceparent?: string;    // W3C trace context — propagate this to keep traces linked
  data: T;                 // event-specific payload
};
```

ה־AMQP headers משקפים שני שדות של המעטפת כדי שתוכל לסנן בלי לפרסר את הגוף:

| Header | ערך |
|---|---|
| `x-event-name` | למשל `export.completed` |
| `x-event-version` | למשל `1` |

## Payloads של אירועים (`data`)

### `export.started`

```ts
type ExportStartedData = {
  jobId: string;
  mediaId: string;
  mediaName: string;
  downloadToComputer: boolean;
  saveToPersonalChannel: boolean;
  selectedUnitChannelIds: string[];
  exportType: "mp4" | "webp";
  items: SavedMediaItem[];
};
```

`SavedMediaItem` הוא discriminated union לפי `type`: `"image" | "clip" | "recording" | "audio"`. פריטי recording ו־audio נושאים טווח זמן `from`/`to`; פריטי image ו־clip לא.

> **אזהרת at-least-once.** `export.started` עשוי לירות יותר מפעם אחת עבור אותו `jobId`. jobs של רינדור רצים על worker נפרד מאחורי quorum queue עם retry בצד ה־broker; כל הגעה חוזרת מפיקה `export.started` חדש לפני ש־FFmpeg מתחיל. בצע dedupe על `data.jobId`.

### `export.completed`

```ts
type ExportCompletedData = {
  jobId: string;
  url: string;             // signed http(s) URL of the rendered output
  exportType: "mp4" | "webp";
};
```

### `export.failed`

```ts
type ExportFailedData = {
  jobId: string;
  error: string;
};
```

שני סוגי כישלון מופיעים כאן:

| `data.error` | משמעות |
|---|---|
| `"invalid envelope"` | פקודת הרינדור הייתה מעוותת (poison message). ה־worker עשה לה ack; היא לא תנוסה מחדש. |
| `"max retries exceeded"` | הרינדור מיצה את מגבלת ההגעה של ה־broker (ברירת מחדל 5). זה הסיגנל הסופי אחרי שכל הניסיונות נגמרו. |
| כל מחרוזת אחרת | ניסיון הרינדור נכשל עם שגיאה חולפת. ה־broker ימסור מחדש עד שתוכת ההגעה תיפגע; אם כל הניסיונות ייכשלו ייכנס `export.failed { error: "max retries exceeded" }` סופי. |

## קישור תור

הכרז על תור עמיד משלך וקשור אותו ל־exchange. כל צוות מחזיק תור משלו.

באמצעות `rabbitmqadmin`:

```bash
rabbitmqadmin declare queue name=my-team-export durable=true
rabbitmqadmin declare binding \
  source=video-editor \
  destination=my-team-export \
  routing_key='export.#'
```

או באופן תוכניתי מהצרכן שלך (הצהרות בעת חיבור ראשון; אידמפוטנטי):

```ts
import { EXCHANGE_NAME } from "@video-editor/contract/events";
await ch.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
await ch.assertQueue("my-team-export", { durable: true });
await ch.bindQueue("my-team-export", EXCHANGE_NAME, "export.#");
```

## צרכן לדוגמה

Node + `amqplib`, עם בדיקת Zod, ack ידני ו־routing לפי header של גרסה.

```ts
import { connect } from "amqplib";
import {
  EXCHANGE_NAME,
  EXPORT_STARTED,
  EXPORT_COMPLETED,
  EXPORT_FAILED,
  X_EVENT_NAME,
  exportStartedEnvelopeSchema,
  exportCompletedEnvelopeSchema,
  exportFailedEnvelopeSchema,
} from "@video-editor/contract/events";

const conn = await connect(process.env.QUEUE_URL!);
const ch = await conn.createChannel();

await ch.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
await ch.assertQueue("my-team-export", { durable: true });
await ch.bindQueue("my-team-export", EXCHANGE_NAME, "export.#");

await ch.prefetch(16);

await ch.consume("my-team-export", async (msg) => {
  if (!msg) return;

  const routingKey = msg.fields.routingKey;
  const headerName = msg.properties.headers?.[X_EVENT_NAME] ?? routingKey;

  let body: unknown;
  try {
    body = JSON.parse(msg.content.toString("utf8"));
  } catch {
    ch.nack(msg, false, false); // route to your DLX
    return;
  }

  try {
    switch (headerName) {
      case EXPORT_STARTED: {
        const parsed = exportStartedEnvelopeSchema.safeParse(body);
        if (!parsed.success) { ch.nack(msg, false, false); return; }
        await onExportStarted(parsed.data.data);
        break;
      }
      case EXPORT_COMPLETED: {
        const parsed = exportCompletedEnvelopeSchema.safeParse(body);
        if (!parsed.success) { ch.nack(msg, false, false); return; }
        await onExportCompleted(parsed.data.data);
        break;
      }
      case EXPORT_FAILED: {
        const parsed = exportFailedEnvelopeSchema.safeParse(body);
        if (!parsed.success) { ch.nack(msg, false, false); return; }
        await onExportFailed(parsed.data.data);
        break;
      }
      default:
        // Unknown routing key — nack-without-requeue so it leaves your queue.
        ch.nack(msg, false, false);
        return;
    }
    ch.ack(msg);
  } catch (err) {
    // Transient — let the broker redeliver.
    ch.nack(msg, false, true);
  }
}, { noAck: false });

// Dedupe handlers on data.jobId — at-least-once delivery.
async function onExportStarted(data) { /* … */ }
async function onExportCompleted(data) { /* … */ }
async function onExportFailed(data) { /* … */ }
```

## הבטחות מסירה

- **At-least-once.** צרכנים חייבים להיות אידמפוטנטיים. בצע dedupe על `data.jobId`.
- **Manual ack נדרש.** `noAck: false`. בצע ack רק אחרי שהעיבוד הצליח.
- **טיפול בכישלון schema.** `nack(msg, false, false)` כדי לנתב ל־DLX שלך. אל תכניס מחדש לתור הודעות מעוותות.
- **טיפול בכישלון חולף.** `nack(msg, false, true)` כדי להחזיר לתור. ה־publisher לא יכול לעזור לך כאן — מדיניות התור שלך חלה.
- **צד ה־publisher.** שרת העורך משתמש ב־publisher confirms עם `mandatory: true`. broker-ack מטופל כהצלחה. החזרות לא־נתיבות (אין תור קשור ל־routing key) נרשמות ומופיעות — השרת עצמו לא מנסה מחדש מעבר לכמה ניסיונות.
- **Dead-lettering.** דאגה של צד הצרכן. ה־publisher לא מגדיר DLX לתור שלך. הגדר `x-dead-letter-exchange` בהצהרת התור שלך אם אתה רוצה שהודעות לא ניתנות לעיבוד ינחתו במקום שניתן לצפות בו.

## מדיניות גרסאות

- **שינוי מוסיף** (שדה אופציונלי חדש ב־`data`): אותו `eventVersion`. צרכנים ישנים ממשיכים לפרסר — סכמות Zod מתייחסות לשדות חדשים באופן מחמיר במדיניות של מאגר זה, אז קבע מחדש את גרסת `@video-editor/contract` שלך כשתוכל.
- **שינוי שובר** (שינוי שם, הסרה, שינוי טיפוס): `eventVersion` חדש. השרת מפרסם גם את הישן וגם את החדש במקביל למשך 4 שבועות לפחות. תזמן את ה־cutover עם צוות ה־producer.
- שדרג את התלות שלך ב־`@video-editor/contract` יחד עם גרסאות ה־producer כדי להישאר מסונכרן עם הסכמה. `eventVersion` במעטפת הוא רשת ביטחון בזמן ריצה — הסתעף עליו אם אתה צריך לתמוך בשתי גרסאות במהלך חלון מיגרציה.

## תעבורה בייצור

בייצור, ה־broker מגיע דרך `amqps://` (TLS עם אימות הדדי). שרת העורך קורא שלושה קבצי PEM באתחול מנתיבים קשיחים:

- `/bundle.pem` — bundle ה־CA הפרטי
- `/tmp/certificates/rabbitmq/rabbit_cert.pem` — תעודת לקוח
- `/tmp/certificates/rabbitmq/rabbit_key.pem` — מפתח לקוח

ה־URL לא נושא userinfo — ה־broker מאמת לפי תעודה.

אם אתה פורס צרכן משלך באותו cluster, פעל לפי אותה תבנית mTLS (או כל מה שה־broker מקבל בצד שלך). ראה [ADR 0006](../architecture/adr/0006-amqplib-built-in-recovery) לאסטרטגיית התאוששות החיבור ש־`amqplib` v1.1+ מספק — הצרכן שלך צריך להצטרף לאותה כדי לשרוד שיבושי broker בלי restart של pod.

הפניה צולבת: מילון ההודעות ב־[architecture/glossary](../architecture/glossary) מגדיר את "Publish", "Unrouted", "Broker Ack", "Event Envelope" ו־"Broker TLS".
