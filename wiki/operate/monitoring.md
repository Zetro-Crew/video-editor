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

## ניטור הרינדור (Render observability)

ה-Worker פולט נתוני ניטור מפורטים לכל ג'וב רינדור — מטריקות לכמות, spans למה קרה בג'וב יחיד, ולוגים לעיון אנושי. שלושת הסוגים נושאים אותם זיהויים כך שאפשר לקפוץ ביניהם.

### מטריקות (Histograms)

נשלחות דרך OTLP push לאוסף ה-OTel ומשם ל-Prometheus/Grafana. כולן בקידומת `biz.` (מתווסף אוטומטית על ידי `@ztube/observability`). בייצוג Prometheus נקודות הופכות לקווים תחתונים, לכן `biz.render.job.duration_ms` נראה בגרפנה כ-`biz_render_job_duration_ms`.

| מטריקה | מה היא מודדת | תוויות (labels) |
|---|---|---|
| `biz.render.job.duration_ms` | משך כולל של ג'וב, מקבלת הודעה מ-AMQP ועד `ack` או `nack` | `outcome` = `completed` / `failed` / `idempotent_hit` |
| `biz.render.idempotency_probe.duration_ms` | בדיקת S3 HEAD לפני התחלת רינדור (האם הפלט כבר קיים) | `outcome` = `completed` / `failed` |
| `biz.render.publish.duration_ms` | פרסום אירוע ל-AMQP כולל broker confirm | `event` = `export.started` / `export.completed`, `outcome` = `completed` / `failed` |
| `biz.render.phase.sources.duration_ms` | שלב הורדה וטרנסקוד של מקורות (MPD, HLS, תמונות) | `outcome` |
| `biz.render.phase.segments.duration_ms` | שלב חיתוך הסגמנטים מהמקור המאוחד | `outcome` |
| `biz.render.phase.overlays_audio.duration_ms` | שלב הכנת overlays, אודיו ו-watermark במקביל | `outcome` |
| `biz.render.phase.final.duration_ms` | שלב סופי — קידוד + העלאה ל-S3 | `outcome`, `format` = `mp4` / `webp` / `dash` |

ה-buckets של כל מטריקה מוגדרים ב-`apps/server/src/features/render/observability/histogram-views.ts`. הם נבחרו לטווחים ריאליים — `phase.final` ו-`job` יכולים להגיע לעד 20 דקות, `publish` יכול להגיע ל-30 שניות תחת לחץ broker, ו-`idempotency_probe` מצופה להישאר מתחת לשנייה.

ה-`outcome` נכתב על כל מטריקה — גם בכישלון. זה אומר ש-p95 של "מה שקרה בכישלון" נצפה (לא רק התסריט המאושר). שאילתת PromQL לדוגמה:

```promql
# p95 משך של שלב סגמנטים, רק לכשלונות
histogram_quantile(0.95,
  sum by (le) (rate(biz_render_phase_segments_duration_ms_bucket{outcome="failed"}[5m])))

# אחוז הצלחה
sum(rate(biz_render_job_duration_ms_count{outcome="completed"}[5m]))
  / sum(rate(biz_render_job_duration_ms_count[5m]))

# שיעור idempotent hits (כמה בקשות חזרו על עצמן ונחסכו)
sum(rate(biz_render_job_duration_ms_count{outcome="idempotent_hit"}[5m]))
  / sum(rate(biz_render_job_duration_ms_count[5m]))
```

`/metrics` של ה-Worker על פורט 8081 לא מכיל את ה-histograms האלה — הוא נשאר עם `messages_in_flight` בלבד. המטריקות זורמות דרך OTLP push, לא scrape.

### Spans (traces)

כל ג'וב מייצר עץ spans יחיד. ה-span ההורה (`render.job`) נוצר כשהצרכן מקבל הודעה ומסתיים בסיום הג'וב. ה-spans הילדים נצמדים אליו אוטומטית דרך OTel active context.

```
amqplib.consumer  (auto-instrumented)
└── render.job  [render.job_id, render.format, render.export_type, amqp.delivery_count, render.outcome]
    ├── render.idempotency_probe  [s3.key, result.hit]
    ├── render.publish.export_started  [messaging.message.name=export.started]  (רק כשיש saveMetadata + delivery_count=0)
    ├── render.phase.sources  [render.source_count, render.source_types, render.outcome]
    ├── render.phase.segments  [render.keep_segment_count, render.segment_count, render.outcome]
    ├── render.phase.overlays_audio  [render.overlay_count, render.audio_source_count, render.has_overlays, render.has_audio, render.outcome]
    ├── render.phase.final  [render.format, render.total_duration_ms, render.frame_time_ms, render.outcome]
    └── render.publish.export_completed  [messaging.message.name=export.completed, render.idempotent_hit]
```

**Trace propagation עובד בין API ל-Worker**: ה-API שמייצר את הבקשה ב-`POST /render` יוצר span משלו, וה-`traceparent` נדבק להודעת AMQP אוטומטית על ידי `@opentelemetry/instrumentation-amqplib`. ב-Jaeger/Tempo תראה את כל המסע — מהבקשת HTTP של הלקוח, דרך publish, consume, FFmpeg, ועד הפרסום הסופי — כ-trace אחד.

תרחישים מיוחדים:
- **Idempotent hit** — `render.job.render.outcome=idempotent_hit`, יש רק שני ילדים: `render.idempotency_probe` (`result.hit=true`) ו-`render.publish.export_completed` (`render.idempotent_hit=true`). אין spans של שלבי FFmpeg.
- **כישלון** — `render.job` סטטוס `ERROR`, `render.outcome=failed`. השלב שזרק exception נושא את ה-exception הוקלט (`span.recordException`). הוא בדרך כלל `render.phase.sources` או `render.phase.final`.

### לוגים מובנים

Pino JSON ל-stdout, נשלף על ידי collector הלוגים של ה-cluster (Loki/Elasticsearch). כל log line של ג'וב רינדור נושא `traceId` ו-`spanId` שמקושרים אוטומטית ל-trace.

**שורות בולטות במהלך רינדור** (נשארות מהלוגינג המקורי לטובת debug ללא backend מלא):

| log message | מתי | שדות |
|---|---|---|
| `[ffmpeg] render started` | תחילת ג'וב | `s3Key`, `format`, `tempDir` |
| `[ffmpeg] sources processed` | סוף שלב המקורות | `durationMs` |
| `[ffmpeg] segments extracted` | סוף חיתוך סגמנטים | `count`, `durationMs` |
| `[ffmpeg] overlays+audio prepared` | סוף הכנת overlays/אודיו | `hasOverlays`, `hasAudio`, `durationMs` |
| `[ffmpeg] render uploaded to S3` | סוף שלב סופי | `s3Key`, `durationMs` |
| `[ffmpeg] temp dir cleaned up` | finally של ג'וב, גם בכישלון | `tempDir` |
| `[render-consumer] render failed — nack with requeue` | כישלון ג'וב | `jobId`, `deliveryCount` + `err` |

**איך לקשר לוגים ל-traces**:
1. מצא ב-Grafana/Jaeger את ה-`trace_id` של הג'וב לפי `render.job_id`.
2. ב-Loki/Elasticsearch הרץ `{traceId="abc..."}` או הפילטר המקביל — תקבל את כל ה-log lines של הג'וב הזה.
3. לחלופין, חפש לפי `businessId=<jobId>` (זה השדה ש-`ZMonitor` מזריק) או `s3Key`.

### זרימת ניטור מקצה לקצה — דוגמה

לקוח שולח `POST /render`. עקב את הג'וב:

1. **API span** (`POST /render`) נוצר אוטומטית על ידי Fastify auto-instrumentation. הוא מפרסם הודעה ל-AMQP עם `traceparent`.
2. **Worker** מקבל את ההודעה. `amqplib.consumer` span נוצר אוטומטית כילד של ה-API span.
3. **`render.job`** נפתח, מתעד `render.job_id`, `render.format`, `render.outcome`.
4. שלבי FFmpeg מתעדים `render.phase.*.duration_ms` ב-histograms עם `outcome=completed`.
5. בסיום, `render.publish.export_completed` יוצא, `render.job.duration_ms` נרשם, ה-message מאושר ל-broker.

תוך כדי, אם משהו נכשל בשלב הסגמנטים:
- `render.phase.segments.duration_ms{outcome="failed"}` מקבל את הזמן שבוזבז.
- ה-span של השלב מקבל `ERROR` status + exception מוקלט.
- ה-log line `[render-consumer] render failed — nack with requeue` יוצא.
- ההודעה חוזרת לתור (עד 5 ניסיונות), בכל ניסיון `amqp.delivery_count` עולה.

### לאלרטים על רינדור

הוסף ל-Grafana כאלרטים:

| תנאי | משמעות | חומרה |
|---|---|---|
| `rate(biz_render_job_duration_ms_count{outcome="failed"}[5m]) > 0.1` | יותר מ-10% ג'ובים נכשלים | P2 |
| `histogram_quantile(0.95, rate(biz_render_phase_final_duration_ms_bucket[10m])) > 600000` | p95 של encode מעל 10 דקות | P3 |
| `histogram_quantile(0.99, rate(biz_render_publish_duration_ms_bucket{event="export.completed"}[5m])) > 5000` | p99 של פרסום אירוע מעל 5 שניות | P3 — broker degradation |
| `rate(biz_render_idempotency_probe_duration_ms_count{outcome="failed"}[5m]) > 0` | S3 לא נגיש | P2 |

## מקורות

- `@ztube/observability` — חבילה חיצונית
- `apps/server/CLAUDE.md`
- `apps/server/src/features/render/observability/histogram-views.ts` — הגדרות buckets
- `apps/server/src/features/render/domain/render-outcome.ts` — אנום ה-outcome
