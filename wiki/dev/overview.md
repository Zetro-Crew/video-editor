# ארכיטקטורה — סקירה

תרשימי המערכת ושלוש הזרימות העיקריות. פירוט API־י ב-[apps/server](apps/server). פירוט פרוטוקול iframe ב-[integrate/iframe](../integrate/iframe). פירוט אירועים ב-[integrate/events](../integrate/events).

## הקשר מערכת

מי מדבר עם המערכת ודרך אילו ערוצים.

```mermaid
flowchart TB
    subgraph clients["Clients / Integrators"]
        USER["Editor User\n(Browser)"]
        PARENT["Parent Application\n(embeds editor via iframe)"]
        CONSUMER["AMQP Consumer\n(external team — reacts to export events)"]
    end

    subgraph ve["Video Editor System"]
        FE["Frontend\nReact 19 + Vite · :3000"]
        SRV["Server (API)\nFastify · :4001"]
        WRK["Server (Worker)\nFFmpeg · :8081"]

        subgraph infra["Infrastructure"]
            S3[("MinIO / S3")]
            MQ{{"RabbitMQ\nvideo-editor + video-editor.commands"}}
        end
    end

    subgraph external["External Services — Closed-Network"]
        CORE["Core Service\n— dev: apps/core-mock :8002 —"]
        VOD["VOD Service\n— dev: apps/mock-vod :5050 —"]
    end

    USER -->|"Edit · Upload · Export"| FE
    PARENT -->|"iframe embed +\npostMessage"| FE
    FE -->|"HTTP / REST"| SRV
    SRV -->|"S3 SDK"| S3
    SRV -->|"publish render.requested,\nexport.*"| MQ
    MQ -->|"render.requested"| WRK
    WRK -->|"upload output"| S3
    WRK -->|"export.started/completed/failed"| MQ
    SRV -->|"GET /play, mint vod-token"| CORE
    SRV -->|"GET MPD, proxy segments"| VOD
    MQ -->|"deliver export.*"| CONSUMER
```

API ו-Worker חולקים image; ה-Worker רץ כ-Deployment נפרד עם entrypoint `src/worker.ts`. ראה [ADR 0005](adr-index).

## זרימת ייצוא

המשתמש לוחץ ייצוא. ה-API מכניס פקודה לתור ויוצא מהדרך — לא ממתין ל-FFmpeg. ה-Worker מבצע, מעלה ל-S3, ומפרסם אירועים.

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Frontend
    participant API as Server API
    participant MQ as RabbitMQ
    participant WRK as Server Worker
    participant S3 as MinIO / S3
    participant CONS as AMQP Consumer

    U->>FE: לחיצה Export
    FE->>API: POST /render { design, options, saveMetadata? }
    API->>MQ: publish render.requested
    API-->>FE: 202 { id: jobId }

    MQ->>WRK: deliver render.requested
    WRK->>MQ: publish export.started (אם saveMetadata)
    MQ-->>CONS: export.started
    WRK->>WRK: spawn FFmpeg
    WRK->>S3: upload output/<jobId>.<ext>
    WRK->>MQ: publish export.completed
    MQ-->>CONS: export.completed
    WRK-->>MQ: ack render.requested
```

ה-FE לא עושה polling. אירועים הם ערוץ התוצאה היחיד. מפתח הפלט דטרמיניסטי מ-`jobId`, כך שמסירה חוזרת לא מרנדרת מחדש (idempotency). כשל סופי לאחר 5 ניסיונות: `export.failed { error: "max retries exceeded" }`.

## זרימת Preview (channel range)

ההורה מבקש חלון מהקלטת ערוץ מנוהל. השרת פותר דרך Core ו-VOD ובונה HLS playlist שהדפדפן יכול לנגן ישירות.

```mermaid
sequenceDiagram
    actor PA as Parent App
    participant FE as Editor iframe
    participant API as Server API
    participant CORE as Core Service
    participant VOD as VOD Service
    participant S3 as MinIO / S3

    PA->>FE: postMessage EDITOR_ADD_PREVIEW_ITEM { recording-range }
    FE->>API: POST /editor/preview-source<br/>Cookie: ztube-token
    API->>CORE: GET /private/channels/:id/play (cookie מועבר)
    CORE-->>API: { url, timeRanges, token: vod-token }
    API->>VOD: GET <mpd-url> (vod-token)
    VOD-->>API: DASH MPD
    API->>API: בונה HLS playlist, חותם segment URLs ב-HMAC
    API->>S3: שומר playlist
    API-->>FE: { playlistUrl, durationMs }
    FE-->>PA: EDITOR_PREVIEW_ITEM_ADDED { itemId }

    loop נגינה
        FE->>API: GET /editor/segment?url=...&sig=...
        API->>VOD: GET segment (vod-token מוזרק)
        VOD-->>API: bytes
        API-->>FE: bytes
    end
```

הדפדפן לא יכול לצרף `vod-token` ל-segments של HLS. ה-proxy מאמת חתימת HMAC ומזריק את ה-token במעלה הזרם. ה-token עם TTL קצר (כ-10 דקות) — playlists ששמורים יותר מזה ייכשלו ב-401 ויש לייצר אותם מחדש.

עבור mediaId מאוחסן (`EDITOR_ADD_MEDIA`): נתיב שונה — Core משרת segments ישירות תחת עוגיית session, ללא `vod-token`. ראה [ADR 0007](adr-index).

## מקורות

- [docs/architecture.md](https://github.com/Zetro-Crew/video-editor/blob/main/docs/architecture.md)
- [apps/server](apps/server) — כל ה-routes ומשתני env
- [integrate/iframe](../integrate/iframe) — קטלוג הודעות postMessage
- [integrate/events](../integrate/events) — מבנה מעטפת AMQP
