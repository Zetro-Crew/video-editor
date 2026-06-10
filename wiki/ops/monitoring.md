# ניטור

השרת וה־worker פולטים traces, מטריקות, profiles ולוגים מובנים דרך החבילה הפנימית [`@ztube/observability`](../architecture/apps/observability), שעוטפת את OpenTelemetry, Pyroscope ו־Pino.

## סיגנלים

| סיגנל | מקור | Exporter |
|---|---|---|
| Traces | אינסטרומנטציה אוטומטית של OpenTelemetry (HTTP, AMQP, AWS SDK, MongoDB, Redis) + spans מותאמים אישית דרך `addCustomSpan` | OTLP ל־`OTEL_ENDPOINT` |
| מטריקות | מטריקות host + runtime של OTel (CPU, זיכרון, GC, event loop), בתוספת endpoint של Prometheus על Worker ב־`/metrics` | OTLP + scrape של Prometheus |
| Profiles | Pyroscope CPU + heap, קישור trace-to-profile | HTTP ל־`pyroscopeServerAddress` |
| לוגים | לוגים מובנים של Pino עם correlation IDs והזרקת trace | stdout (JSON), נשלחים על ידי אספן הלוגים שלך |

OTel **מושבת** כש־`OTEL_ENDPOINT` לא מוגדר — שימושי לפיתוח מקומי.

## env לחיווט

| Var | ברירת מחדל | הערות |
|---|---|---|
| `SERVICE_NAME` | `video-editor-server` | הבדל בין API ל־Worker על ידי הגדרת ערך שונה ב־Deployment כל אחד אם אתה רוצה לפצל אותם ב־backend הניטור שלך. |
| `SERVICE_VERSION` | `1.0.0` | הגדר אותו לפי tag ה־image ב־K8s spec. |
| `LOG_LEVEL` | `info` | רמות Pino: `trace`/`debug`/`info`/`warn`/`error`. |
| `OTEL_ENDPOINT` | לא מוגדר | endpoint של OTLP collector. נדרש למעקב/מטריקות. |
| `WORKER_PROBE_PORT` | `8081` | probe + מטריקות Prometheus של Worker. |

endpoint של Pyroscope מחווט בקוד דרך `initTelemetry({ pyroscopeServerAddress: … })` — הגדר את הערך דרך קריאת `initTelemetry` ב־entrypoint שלך או חשוף אותו כ־env var משלך.

## Endpoints של probe ומטריקות

| תהליך | Endpoint | מחזיר |
|---|---|---|
| API | `GET /health` | `{ status: "ok" }` — liveness של K8s |
| Worker | `GET /health` | liveness |
| Worker | `GET /ready` | readiness — true אחרי שצרכן ה־AMQP נרשם |
| Worker | `GET /metrics` | פורמט exposition של Prometheus |

## Distributed tracing

Spans מפשטים end-to-end דרך השדה `traceparent` בכל מעטפת אירוע AMQP:

```
parent app fetch → API HTTP handler → publish render.requested
                                            ↓
                                  Worker consume render.requested
                                            ↓
                          publish export.started / export.completed
                                            ↓
                                  consumer team's handler
```

אם אתה צורך אירועים, העתק את `envelope.traceparent` להקשר OTel שלך כך שה־spans שלך יקושרו ל־trace של שרת העורך. הסכמה היא `string` כך שהפצת קונטקסט פשוטה עובדת.

Spans מותאמים אישית עבור FFmpeg, העלאות S3 ופרסומי AMQP נוספים בגבולות ה־use-case דרך `addCustomSpan`. Profiles של Pyroscope מצטרפים לקונטקסט ה־trace אוטומטית כששניהם מופעלים.

## מטריקות מפתח לאזעקה

נגזרות מנתיבי השגיאה של השרת. שמות אזעקה הם הצעות — חבר ל־backend המטריקות שלך.

### AMQP

| מטריקה | מה זה אומר לך | רעיון לסף |
|---|---|---|
| `render.dead.messages_ready > 0` | jobs רינדור פגעו ב־`x-delivery-limit=5` ועברו ל־dead-letter. כל אחד כבר הפיק `export.failed { error: "max retries exceeded" }` סופי. **P1** — חקור שורש כשל FFmpeg. | `> 0` למשך דקה |
| `render.requested.messages_ready` | backlog של תור. צמיחה מתמשכת → workers לא עומדים בקצב. | `> 100` מתמשך למשך 15 דקות |
| `render.requested.consumers == 0` | אין pod של worker שצורך. **P1.** | בכל זמן |
| Publish-confirm timeouts בלוגים | ה־broker קיבל אך לא אישר. ה־publisher מנסה מחדש; timeouts מתמשכים משמעם stress של broker. | יותר מכמה לדקה |
| `unrouted` / `return` בלוגים | להודעת mandatory אין binding של תור. משמע תור של צוות צרכן חסר או לא קשור. | כל אחד |

### FFmpeg / worker

| מטריקה | מקור | מה זה אומר לך |
|---|---|---|
| CPU של pod Worker קרוב לגבול (`4000m`) | מטריקות K8s | FFmpeg מרווה — הגדל workers או כוונן concurrency. |
| צמיחת זיכרון של pod Worker | מטריקות K8s | סביר ילד FFmpeg תקוע או MPD גדול; עקוב יחד עם `TRANSCODE_TIMEOUT_MS`. |
| שיעור יציאה לא-אפס של FFmpeg | לוגים (חפש `ffmpeg` + `exit`) | בעיות איכות מקור או חוסר התאמה של codec. |

### S3 / preview

| מטריקה | מה זה אומר לך |
|---|---|
| שיעור 4xx של `/editor/segment` | סביר `vod-token` שפג שצרוב לתוך playlists — ראה [runbooks](runbooks). |
| שיעור 5xx של PUT ל־S3 (העלאות + פלט רינדור) | תקלת אחסון. |

### אפליקציה

- HTTP 503 על `/render`: פרסום AMQP מיצה ניסיונות חוזרים. ה־broker חולה או ה־URL/אישורים שגויים. ראה [ADR 0005](../architecture/adr/0005-render-worker-deployment).
- HTTP 5xx על `/editor/preview-source`: בדרך כלל כשל של Core או VOD במעלה הזרם. הבקשה מועברת ל־Core; בדוק קודם את הלוגים של Core.

## לוגים

Pino JSON ל־stdout. שדות קורלציה מרכזיים:

| שדה | מקור |
|---|---|
| `traceId` / `spanId` | מוזרק אוטומטית מהקשר OTel |
| `service.name` / `service.version` | מ־`SERVICE_NAME` / `SERVICE_VERSION` |
| `processName` (`amqp-publish` / `amqp-consume`) | מ־`ZMonitor` wrappers |
| `stageName` (למשל `export.completed`, `render.requested`) | מ־`ZMonitor` |
| `businessId` (בדרך כלל `jobId`) | מ־`ZMonitor` |

חפש לפי `businessId` כדי לעקוב אחר רינדור יחיד דרך API → broker → worker → events.

אירועי לוג מובנים בולטים (ידידותיים לחיפוש):

| הודעת לוג | משמעות |
|---|---|
| `amqp_publish_drained_unconfirmed` | כיבוי פג timeout לפני שה־broker אישר את הפרסום בטיסה. ההודעה אולי נתבה ואולי לא. |
| `amqp_publisher_channel_handler_error`, `amqp_publisher_model_handler_error` | זריקה סינכרונית בתוך handler של `close`/`error`/`return` של amqplib. עוקב רגרסיות בקוד התאוששות חיבור. |
| `reconnect-scheduled` (rate-limited: ניסיון 1 + כל 10) | תקלת broker, לולאת התאוששות פעילה. |
| `logAborting` | תקציב ניסיונות חוזרים מוצה על פרסום. פקודות → 503 ללקוח; אירועים → נבלעים (ונפלטים כלוג הזה). |
