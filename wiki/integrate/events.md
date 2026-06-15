# צריכת אירועי AMQP

שרת העורך מפרסם אירועי מחזור-חיים של רינדור ל-topic exchange יחיד של RabbitMQ. צוות חיצוני קושר תור משלו וצורך.

## התקנה

```bash
pnpm add @video-editor/contract@<version> amqplib
```

נעל את שתי הגרסאות. `@video-editor/contract` מסופקת מה-registry הפנימי. **אסור לשכפל את המאגר.**

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
| `export.started` | רינדור התחיל (לפני FFmpeg) |
| `export.completed` | פלט הועלה ל-S3; URL חתום ב-payload |
| `export.failed` | רינדור נכשל (חולף → retry של broker; סופי נושא `error: "max retries exceeded"`) |

קשור עם `export.#` לכל השלושה, או עם `export.completed` וכו' לסינון.

## מבנה המעטפת

כל גוף הוא אותה מעטפת. Content-Type: `application/json`. `persistent: true`.

```ts
type Envelope<T> = {
  eventName: string;       // תואם routing key
  eventVersion: number;    // גרסת schema (נוכחי: 1 לכולם)
  occurredAt: string;      // ISO-8601 UTC
  traceparent?: string;    // W3C trace context — העבר כדי לשמור traces מקושרים
  data: T;                 // payload לכל אירוע
};
```

AMQP headers משקפים שני שדות לסינון בלי לפרסר את הגוף:

| Header | ערך |
|---|---|
| `x-event-name` | למשל `export.completed` |
| `x-event-version` | למשל `1` |

## Payloads

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

`SavedMediaItem` הוא discriminated union לפי `type`: `"image" | "clip" | "recording" | "audio"`. פריטי recording ו-audio נושאים `from`/`to`; פריטי image ו-clip לא.

**at-least-once.** `export.started` עשוי לפרסם יותר מפעם אחת לאותו `jobId`. ה-worker רץ מאחורי quorum queue עם retry של broker; כל מסירה חוזרת מפיקה `export.started` חדש לפני FFmpeg. **dedupe על `data.jobId`.**

### `export.completed`

```ts
type ExportCompletedData = {
  jobId: string;
  url: string;             // URL http(s) חתום של הפלט
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

שלושה סוגי כשל מופיעים כאן:

| `data.error` | משמעות |
|---|---|
| `"invalid envelope"` | פקודת הרינדור הייתה מעוותת (poison). ה-worker עשה ack; לא תנוסה מחדש. |
| `"max retries exceeded"` | מיצוי `x-delivery-limit=5`. סיגנל סופי. |
| כל מחרוזת אחרת | ניסיון בודד נכשל עם שגיאה חולפת. broker ימסור מחדש עד מיצוי; הסופי יישא `"max retries exceeded"`. |

## קישור תור

הכרז על תור עמיד משלך וקשור ל-exchange. כל צוות מחזיק תור משלו.

`rabbitmqadmin`:

```bash
rabbitmqadmin declare queue name=my-team-export durable=true
rabbitmqadmin declare binding \
  source=video-editor \
  destination=my-team-export \
  routing_key='export.#'
```

תוכניתי (אידמפוטנטי בעת חיבור ראשוני):

```ts
import { EXCHANGE_NAME } from "@video-editor/contract/events";
await ch.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
await ch.assertQueue("my-team-export", { durable: true });
await ch.bindQueue("my-team-export", EXCHANGE_NAME, "export.#");
```

## צרכן לדוגמה

Node + `amqplib` + Zod + ack ידני + routing לפי header.

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
  const headerName = msg.properties.headers?.[X_EVENT_NAME] ?? msg.fields.routingKey;

  let body: unknown;
  try { body = JSON.parse(msg.content.toString("utf8")); }
  catch { ch.nack(msg, false, false); return; } // route ל-DLX שלך

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
        ch.nack(msg, false, false);
        return;
    }
    ch.ack(msg);
  } catch {
    ch.nack(msg, false, true); // חולף — broker ימסור מחדש
  }
}, { noAck: false });

async function onExportStarted(data: ExportStartedData) { /* dedupe על data.jobId */ }
async function onExportCompleted(data: ExportCompletedData) { /* ... */ }
async function onExportFailed(data: ExportFailedData) { /* ... */ }
```

## הבטחות מסירה

- **At-least-once.** dedupe על `data.jobId`.
- **Manual ack חובה.** `noAck: false`. ack רק אחרי עיבוד מוצלח.
- **כשל schema:** `nack(msg, false, false)` → DLX שלך. אסור להחזיר לתור הודעות מעוותות.
- **כשל חולף:** `nack(msg, false, true)` → broker מחזיר לתור. מדיניות התור שלך חלה.
- **publisher.** השרת משתמש ב-publisher confirms + `mandatory: true`. החזרות unrouted (אין תור קשור) נרשמות; השרת לא מנסה מחדש מעבר לכמה ניסיונות.
- **Dead-lettering.** הצרכן מטפל. אם אתה רוצה ש-poison ינחת ב-DLQ צפיה, הגדר `x-dead-letter-exchange` בהצהרת התור שלך.

## מדיניות גרסאות

- **שינוי מוסיף** (שדה אופציונלי חדש): אותו `eventVersion`. צרכנים ישנים ממשיכים לפרסר — סכמות Zod של החבילה הזו מחמירות, אז שדרג את `@video-editor/contract` כשתוכל.
- **שינוי שובר** (rename, הסרה, type change): `eventVersion` חדש. השרת מפרסם גם ישן וגם חדש במקביל לפחות 4 שבועות. תאם cutover עם צוות ה-producer.
- שדרג את התלות שלך ב-`@video-editor/contract` יחד עם גרסאות producer. `eventVersion` במעטפת = רשת ביטחון בזמן ריצה — הסתעף עליה אם אתה תומך בשתי גרסאות בחלון מיגרציה.

## ייצור — תעבורה

ה-broker בייצור על `amqps://` עם mTLS. שרת העורך קורא שלושה PEMs באתחול:

- `/bundle.pem` — bundle CA פרטי
- `/tmp/certificates/rabbitmq/rabbit_cert.pem` — תעודת לקוח
- `/tmp/certificates/rabbitmq/rabbit_key.pem` — מפתח לקוח

ה-URL לא נושא userinfo — broker מאמת לפי תעודה.

אם הצרכן שלך רץ באותו cluster, פעל לפי אותה תבנית mTLS (או כל מה שה-broker מקבל בצד שלך). ראה [ADR 0006](../dev/adr-index) לאסטרטגיית התאוששות החיבור של `amqplib` v1.1+ — הצרכן שלך צריך לאמץ אותה כדי לשרוד שיבושי broker בלי restart.

## מקורות

- [packages/contract](../dev/apps/contract) ו-[packages/contract/src/events/README.md](https://github.com/Zetro-Crew/video-editor/blob/main/packages/contract/src/events/README.md)
- מילון "Publish", "Unrouted", "Broker Ack", "Event Envelope", "Broker TLS": [dev/glossary](../dev/glossary)
