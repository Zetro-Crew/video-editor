# ניטור

ה-API וה-Worker פולטים traces, metrics, profiles ו-logs מובנים דרך `@ztube/observability` — חבילה חיצונית מהרג'יסטרי הפנימי שעוטפת OpenTelemetry, Pyroscope ו-Pino.

## סיגנלים

| סיגנל | מקור | Exporter |
|---|---|---|
| Traces | OTel auto-instrumentation (HTTP, AMQP, AWS SDK, MongoDB, Redis) + spans מותאמים אישית דרך `addCustomSpan` | OTLP ל-`OTEL_ENDPOINT` |
| Metrics | host + runtime metrics של OTel (CPU, memory, GC, event loop), בתוספת Prometheus endpoint על Worker ב-`/metrics` | OTLP + scrape של Prometheus |
| Profiles | Pyroscope CPU + heap, קישור trace-to-profile | HTTP ל-`pyroscopeServerAddress` |
| Logs | Pino מובנה עם correlation IDs והזרקת trace | stdout (JSON), נשלף על ידי collector הלוגים שלך |

OTel **מושבת** כש-`OTEL_ENDPOINT` לא מוגדר — שימושי לפיתוח מקומי.

## env לחיווט

| Var | ברירת מחדל | הערות |
|---|---|---|
| `SERVICE_NAME` | `video-editor-server` | הבדל בין API ל-Worker אם רצוי לפצל ב-backend הניטור |
| `SERVICE_VERSION` | `1.0.0` | הגדר לפי tag ה-image |
| `LOG_LEVEL` | `info` | `trace`/`debug`/`info`/`warn`/`error` |
| `OTEL_ENDPOINT` | לא מוגדר | OTLP collector. נדרש ל-traces/metrics. |
| `WORKER_PROBE_PORT` | `8081` | probe + מטריקות Prometheus של Worker |

endpoint של Pyroscope מחווט בקוד דרך `initTelemetry({ pyroscopeServerAddress: ... })` — הגדר ב-entrypoint שלך או חשוף כ-env משלך.

## Probes ומטריקות

| תהליך | Endpoint | מחזיר |
|---|---|---|
| API | `GET /health` | `{ status: "ok" }` |
| Worker | `GET /health` | liveness |
| Worker | `GET /ready` | readiness — true אחרי שצרכן ה-AMQP נרשם |
| Worker | `GET /metrics` | פורמט exposition של Prometheus |

## Distributed tracing

spans נוצרים end-to-end דרך השדה `traceparent` בכל מעטפת אירוע AMQP:

```
parent app fetch → API HTTP handler → publish render.requested
                                            ↓
                                  Worker consume render.requested
                                            ↓
                          publish export.started / export.completed
                                            ↓
                                  consumer team's handler
```

אם אתה צרכן אירועים, העתק `envelope.traceparent` להקשר ה-OTel שלך כדי שה-spans שלך יקושרו ל-trace של שרת העורך. הסכמה היא `string` — propagation פשוטה עובדת.

spans מותאמים אישית ל-FFmpeg, S3 uploads ופרסומי AMQP נוספים בגבולות ה-use-case דרך `addCustomSpan`. Pyroscope profiles מצטרפים להקשר ה-trace אוטומטית כששניהם מופעלים.

## מטריקות מפתח לאזעקה

נגזרות מנתיבי השגיאה של הקוד. שמות האזעקה הצעות — חבר ל-backend המטריקות שלך.

### AMQP

| מטריקה | משמעות | סף מוצע |
|---|---|---|
| `render.dead.messages_ready > 0` | רינדורים מיצו `x-delivery-limit=5` ועברו ל-DLQ. כל אחד כבר הפיק `export.failed { error: "max retries exceeded" }`. **P1.** | `> 0` למשך דקה |
| `render.requested.messages_ready` | backlog של תור. צמיחה מתמשכת → workers לא עומדים בקצב. | `> 100` מתמשך 15 דקות |
| `render.requested.consumers == 0` | אין pod של Worker שצורך. **P1.** | תמיד |
| timeouts של publish-confirm בלוגים | broker קיבל אך לא אישר. publisher מנסה מחדש; timeouts מתמשכים = stress של broker. | יותר מכמה לדקה |
| `unrouted` / `return` בלוגים | mandatory publish ללא binding מתאים. תור צרכן חסר או לא קשור. | כל מופע |

### FFmpeg / Worker

| מטריקה | מקור | משמעות |
|---|---|---|
| CPU של Worker pod קרוב לגבול (`4000m`) | K8s metrics | FFmpeg מרווה — הגדל workers או כוונן concurrency |
| צמיחת זיכרון של Worker pod | K8s metrics | ילד FFmpeg תקוע או MPD גדול; עקוב יחד עם `TRANSCODE_TIMEOUT_MS` |
| שיעור exit לא-אפס של FFmpeg | לוגים (`ffmpeg` + `exit`) | בעיות איכות מקור או חוסר התאמת codec |

### S3 / preview

| מטריקה | משמעות |
|---|---|
| שיעור 4xx של `/editor/segment` | סביר `vod-token` שפג שצרוב לתוך playlists — ראה [runbooks](runbooks). |
| שיעור 5xx של PUT ל-S3 | תקלת אחסון |

### אפליקציה

- **HTTP 503 על `/render`:** פרסום AMQP מיצה ניסיונות. broker חולה או URL/אישורים שגויים. ראה [ADR 0005](../dev/adr-index).
- **HTTP 5xx על `/editor/preview-source`:** בדרך כלל כשל Core או VOD במעלה הזרם. הבקשה מועברת ל-Core; בדוק לוגי Core ראשון.

## לוגים

Pino JSON ל-stdout. שדות correlation מרכזיים:

| שדה | מקור |
|---|---|
| `traceId` / `spanId` | הזרקה אוטומטית מהקשר OTel |
| `service.name` / `service.version` | מ-`SERVICE_NAME` / `SERVICE_VERSION` |
| `processName` (`amqp-publish` / `amqp-consume`) | מ-`ZMonitor` wrappers |
| `stageName` (למשל `export.completed`, `render.requested`) | מ-`ZMonitor` |
| `businessId` (בדרך כלל `jobId`) | מ-`ZMonitor` |

חפש לפי `businessId` כדי לעקוב רינדור יחיד API → broker → worker → events.

אירועי לוג מובנים בולטים:

| הודעת לוג | משמעות |
|---|---|
| `amqp_publish_drained_unconfirmed` | כיבוי פג timeout לפני שה-broker אישר publish בטיסה. ההודעה אולי נתבה ואולי לא. |
| `amqp_publisher_channel_handler_error`, `amqp_publisher_model_handler_error` | זריקה סינכרונית בתוך handler של `close`/`error`/`return` של amqplib. עוקב רגרסיות בקוד התאוששות. |
| `reconnect-scheduled` (rate-limited: ניסיון 1 + כל 10) | תקלת broker, לולאת התאוששות פעילה. |
| `logAborting` | תקציב ניסיונות חוזרים על publish מוצה. פקודות → 503 ללקוח; אירועים → נבלעים. |

## מקורות

- `@ztube/observability` — חבילה חיצונית
- `apps/server/CLAUDE.md`
