# Video Editor – ארכיטקטורה והפניית זרימה

> הפניה חיה עבור ה־monorepo. עדכן כשהשירותים, ה־routes או זרימות הנתונים משתנים.

---

## 1. סקירת מערכת

התמונה הגדולה: מי מתקשר עם המערכת ודרך אילו ערוצים.

```mermaid
flowchart TB
    subgraph clients["Clients / Integrators"]
        USER["Editor User\n(Browser)"]
        PARENT["Parent Application\n(embeds editor via iframe)"]
        CONSUMER["AMQP Consumer\n(external team — reacts to export events)"]
    end

    subgraph ve["Video Editor System"]
        FE["Frontend\nReact 19 + Vite · :3000"]
        SRV["Server\nFastify + Node.js · :4000"]

        subgraph infra["Infrastructure"]
            S3[("MinIO / S3\nObject Storage")]
            REDIS[("Redis\nJob State")]
            MQ{{"RabbitMQ\nvideo-editor topic exchange"}}
        end
    end

    subgraph external["External Services — Closed-Network"]
        CORE["Core Service\nAuth · Channels · VOD Token Mint\n— dev: apps/core-mock :8002 —"]
        VOD["VOD Service\nDASH Streaming: MPD + Segments\n— dev: apps/mock-vod :5050 —"]
    end

    subgraph devtools["Dev Harness (local only)"]
        DEMO["iFrame Demo\nAngular 21 · :8080\nExercises postMessage protocol"]
    end

    USER -->|"Edit · Upload · Export"| FE
    PARENT -->|"iframe embed +\npostMessage protocol"| FE
    DEMO -->|"iframe embed +\npostMessage protocol"| FE
    FE -->|"HTTP / REST\n(Vite proxy in dev)"| SRV
    SRV -->|"Store / retrieve files\n(S3 SDK)"| S3
    SRV -->|"Read/write job state\n(TTL-keyed)"| REDIS
    SRV -->|"Publish export events\n(publisher confirms)"| MQ
    SRV -->|"GET /play\nauth + vod-token mint"| CORE
    SRV -->|"GET MPD manifest\nproxy segments (token injected)"| VOD
    MQ -->|"Deliver to bound queues"| CONSUMER
```

---

## 2. מפת Containers

כל יחידות הפריסה והתלויות הישירות שלהן.

```mermaid
flowchart LR
    subgraph browser["Browser"]
        FE["Frontend\nReact 19 · Zustand · Remotion\n:3000"]
    end

    subgraph server["Server"]
        SRV_UPLOAD["upload\n/upload/signed-url\n/uploads/file\n/cleanup"]
        SRV_EDIT["edit-video\n/edit-video\n/edit-video/progress/:jobId"]
        SRV_RENDER["render\n/render (POST · GET · DELETE)"]
        SRV_PREVIEW["preview\n/editor/preview-source\n/editor/segment"]
        SRV_EXPORT["editor-export\n/editor/export"]
    end

    subgraph infra["Infrastructure"]
        S3[("MinIO / S3")]
        REDIS[("Redis")]
        MQ{{"RabbitMQ"}}
    end

    subgraph ext["External Services"]
        CORE["Core Service"]
        VOD["VOD Service"]
    end

    PKG["@video-editor/contract\nZod schemas: iframe · events · internal"]

    FE -- "POST /uploads/file\nPOST /upload/signed-url" --> SRV_UPLOAD
    FE -- "POST /edit-video\nGET /edit-video/progress/:id" --> SRV_EDIT
    FE -- "POST /render\nGET /render?id=\nDELETE /render?id=" --> SRV_RENDER
    FE -- "POST /editor/preview-source\nGET /editor/segment" --> SRV_PREVIEW
    FE -- "POST /editor/export" --> SRV_EXPORT

    SRV_UPLOAD --> S3
    SRV_EDIT --> S3
    SRV_EDIT --> REDIS
    SRV_RENDER --> S3
    SRV_RENDER --> REDIS
    SRV_RENDER --> MQ
    SRV_PREVIEW --> CORE
    SRV_PREVIEW --> VOD
    SRV_PREVIEW --> S3

    PKG -. "types consumed by" .-> FE
    PKG -. "types consumed by" .-> SRV_RENDER
    PKG -. "types consumed by" .-> SRV_PREVIEW
```

---

## 3. זרימת ייצוא

משתמש מייצא הרכבה → FFmpeg מקודד → קובץ מאוחסן ב־S3 → צוותים חיצוניים מוזמנים דרך AMQP.

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant SRV as Server
    participant RD as Redis
    participant FF as FFmpeg
    participant S3 as MinIO / S3
    participant MQ as RabbitMQ
    participant CONS as AMQP Consumer

    User->>FE: Click "Export"
    FE->>SRV: POST /render<br/>{ design: IDesign, options, saveMetadata? }
    SRV->>RD: job[jobId] = PROCESSING
    SRV-->>FE: 202 Accepted { id: jobId }

    Note over SRV,CONS: saveMetadata triggers event publishing
    opt saveMetadata present
        SRV->>MQ: export.started { jobId, mediaId, exportType, … }
        MQ-->>CONS: deliver export.started
    end

    SRV->>FF: spawn ffmpeg (H.264 / WebP / DASH)
    loop progress
        FF-->>SRV: frame count callback
        SRV->>RD: update progress %
    end
    FF-->>SRV: done

    SRV->>S3: upload → output/<timestamp>/rendered.mp4
    S3-->>SRV: OK
    SRV->>RD: job[jobId] = COMPLETED, url = signed S3 URL

    opt saveMetadata present
        SRV->>MQ: export.completed { jobId, url, exportType }
        MQ-->>CONS: deliver export.completed
    end

    Note over FE,SRV: Frontend polls until COMPLETED
    FE->>SRV: GET /render?id=jobId
    SRV->>RD: read job state
    SRV-->>FE: { status: COMPLETED, url }
    FE->>User: Download / save confirmation
```

---

## 4. זרימת Preview ואינטגרציית iframe

הורה מטמיע את העורך → שולח טווח הקלטה → השרת פותר אותו לתוך HLS playlist ניתן לזרימה → הדפדפן מנגן אותו דרך proxy בצד שרת.

```mermaid
sequenceDiagram
    actor PA as Parent Application
    participant FE as Frontend<br/>(/editor/embed)
    participant SRV as Server
    participant CORE as Core Service
    participant VOD as VOD Service
    participant S3 as MinIO / S3

    PA->>FE: Load iframe src="/editor/embed"
    FE-->>PA: postMessage EDITOR_READY

    PA->>FE: postMessage EDITOR_ADD_PREVIEW_ITEM<br/>{ kind: "recording-range",<br/>  channelId, startTimeMs, endTimeMs }

    FE->>SRV: POST /editor/preview-source<br/>{ source: { type: "channel-range", channelId, startTimeMs, endTimeMs } }<br/>Cookie: ztube-token (HttpOnly — browser attaches automatically)

    SRV->>CORE: GET /private/channels/:id/play?start=&end=<br/>(forwards ztube-token)
    CORE->>CORE: mint vod-token<br/>register token with VOD Service
    CORE-->>SRV: { url: mpd-url, timeRanges, token: vod-token }

    SRV->>VOD: GET <mpd-url><br/>vod-token: <token>
    VOD-->>SRV: DASH MPD document

    SRV->>SRV: parse MPD segments<br/>build HLS playlist (m3u8)<br/>HMAC-sign each segment URL
    SRV->>S3: store HLS playlist
    S3-->>SRV: OK

    SRV-->>FE: { type: "hls", playlistUrl: signed-s3-url, duration }
    FE-->>PA: postMessage EDITOR_PREVIEW_ITEM_ADDED { itemId }

    Note over FE,VOD: Segments cannot carry custom headers from the browser.<br/>Server proxy injects vod-token on every fetch.

    loop playback
        FE->>SRV: GET /editor/segment?url=…&sig=…
        SRV->>VOD: GET <segment> with vod-token injected
        VOD-->>SRV: segment bytes
        SRV-->>FE: streamed bytes
    end
```

---

## 5. זרימת העלאה

משתמש מעלה קובץ מדיה → נשמר ב־S3 → נוסף לציר הזמן של העורך.

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant SRV as Server
    participant S3 as MinIO / S3

    User->>FE: Select file (video / image / audio)

    alt Direct upload (≤ 500 MB multipart)
        FE->>SRV: POST /uploads/file (multipart/form-data)
        SRV->>SRV: validate MIME type + extension
        SRV->>S3: stream → uploads/<key>
        S3-->>SRV: OK
        SRV-->>FE: { s3Key, filename, mimetype, url, size }
    else Presigned URL upload
        FE->>SRV: POST /upload/signed-url { filename, contentType }
        SRV->>S3: generate presigned PUT URL
        S3-->>SRV: presigned URL
        SRV-->>FE: { uploadUrl, s3Key }
        FE->>S3: PUT file directly
        S3-->>FE: 200 OK
    end

    FE->>FE: autoAddUploadedMedia()<br/>— append to timeline via useUploadStore
```

---

## 6. זרימת Edit-Video (job FFmpeg אסינכרוני)

עיבוד חיתוך/גזירה נפרד מרינדור Remotion. מחזיר קובץ מעובד שהעורך יכול להפנות אליו.

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant SRV as Server
    participant RD as Redis
    participant FF as FFmpeg
    participant S3 as MinIO / S3

    FE->>SRV: POST /edit-video<br/>{ source, cuts, trimFrom, trimTo, format }
    SRV->>RD: job[jobId] = PROCESSING
    SRV-->>FE: 202 Accepted { jobId }

    SRV->>FF: resolve source (HLS / DASH / image / audio / blank)<br/>apply cuts + trim, encode output
    loop progress polling
        FE->>SRV: GET /edit-video/progress/:jobId
        SRV->>RD: read state
        SRV-->>FE: { status: PROCESSING, progress }
    end

    FF-->>SRV: done (output file path)
    SRV->>S3: upload processed file
    SRV->>RD: job[jobId] = COMPLETED, outputFile = signed URL

    FE->>SRV: GET /edit-video/progress/:jobId
    SRV-->>FE: { status: COMPLETED, outputFile: signed-url }
```

---

## 7. חוזה אירועי AMQP

אירועים שמפורסמים ל־topic exchange של `video-editor`. צרכנים חיצוניים קושרים תורים ל־routing keys.

```mermaid
flowchart LR
    SRV["Server"] -->|"export.started"| EX{{"video-editor\ntopic exchange"}}
    SRV -->|"export.completed"| EX
    SRV -->|"export.failed"| EX

    EX -->|"route by key"| Q1["Consumer Queue A\n(e.g. media-library team)"]
    EX -->|"route by key"| Q2["Consumer Queue B\n(e.g. analytics team)"]

    Q1 --> C1["Consumer A"]
    Q2 --> C2["Consumer B"]
```

**מבנה המעטפת** (כל האירועים):

```
{
  eventName:     "export.started" | "export.completed" | "export.failed"
  eventVersion:  1
  occurredAt:    ISO-8601 UTC
  traceparent?:  W3C trace context
  data:          { …event-specific payload… }
}
```

AMQP headers משקפים את המעטפת (`x-event-name`, `x-event-version`) לסינון בצד ה־broker בלי לפרסר את הגוף.

---

## 8. חוזה postMessage (הטמעת iframe)

העורך מתארח ב־`/editor/embed`. כל אפליקציית הורה יכולה להטמיע אותו.

```mermaid
sequenceDiagram
    participant PA as Parent App
    participant ED as Editor iframe

    PA->>ED: (load iframe)
    ED-->>PA: EDITOR_READY

    PA->>ED: EDITOR_ADD_PREVIEW_ITEM<br/>{ kind: "recording-range" | "media" | "audio-range", …payload }
    alt accepted
        ED-->>PA: EDITOR_PREVIEW_ITEM_ADDED { requestId?, itemId }
    else rejected
        ED-->>PA: EDITOR_PREVIEW_ITEM_REJECTED { requestId?, reason }
    end

    PA->>ED: EDITOR_CLEAR_PROJECT { requestId? }
    ED-->>PA: EDITOR_PROJECT_CLEARED { requestId? }

    Note over ED,PA: After user exports
    ED-->>PA: EDITOR_MEDIA_SAVED { url, mediaId, mediaName,<br/>downloadToComputer, saveToPersonalChannel,<br/>selectedUnitChannelIds }
```

**הזדהות:** `ztube-token` הוא HttpOnly — הדפדפן מצרף אותו אוטומטית ב־fetches של same-domain. ההורה לעולם לא קורא או מעביר אותו. שרת העורך קורא אותו מ־header של `Cookie` ומעביר אותו ל־Core.

---

## 9. מדריך החלפת Mock Services → ייצור

| Dev Mock | פורט | שירות אמיתי שמוחלף | מה הוא עושה בייצור |
|---|---|---|---|
| `apps/core-mock` | 8002 | **Core Service** | שירות פלטפורמה מרכזי: זהות משתמש (`/private/users/me`), קטלוג ערוצים מנוהל ו**Channel Play API** (`GET /private/channels/:id/play`) שמטביע VOD Token קצר-מועד ומחזיר את ה־MPD URL לטווח זמן. |
| `apps/mock-vod` | 5050 | **VOD Service** | backend וידאו on-demand: מאמת את ה־VOD Token בכל בקשה, משרת את ה־DASH MPD manifest להקלטה ומזרים את ה־DASH segments הגולמיים (init + media fragments). |

**רשימת החלפה** (שני השירותים):
- הגדר את `CORE_BASE_URL` ב־`apps/server/.env` ל־URL בסיס `/private` האמיתי של Core.
- הסר או עצור את `apps/core-mock` ו־`apps/mock-vod` מ־`docker compose` / `pnpm dev`.
- ודא ש־`ztube-token` מוגדר כ־HttpOnly על ידי אפליקציית ההורה על ה־shared domain.
- ודא ש־TTL של VOD Token תואם או עולה על משך session הצפוי (ברירת מחדל של mock: 10 דקות).
- ודא ש־segment proxy (`/editor/segment`) יכול להגיע ל־host של VOD האמיתי מרשת השרת.

---

## 10. משתני סביבה מרכזיים

| משתנה | שירות | חובה | תיאור |
|---|---|---|---|
| `CORE_BASE_URL` | server | כן | URL בסיס `/private` של Core האמיתי. ברירת מחדל לפיתוח: `http://localhost:8002/private` |
| `PREVIEW_SIGNING_SECRET` | server | כן | סוד HMAC-SHA256 עבור segment proxy (מינימום 32 תווים). מונע SSRF. |
| `QUEUE_URL` | server | כן | URL חיבור AMQP. השרת מסרב להתחיל בלעדיו. `amqps://` מפעיל mTLS — התהליך קורא את `/bundle.pem` ו־`/tmp/certificates/rabbitmq/rabbit_{cert,key}.pem` באתחול. |
| `S3_ENDPOINT` | server | כן | endpoint של MinIO / S3. פיתוח: `http://localhost:9000` |
| `S3_BUCKET` | server | כן | שם bucket. פיתוח: `video-editor` |
| `REDIS_HOST` / `REDIS_PORT` | server | כן | חיבור Redis. ברירות מחדל לפיתוח: `localhost:6379` |
| `SERVER_BASE_URL` | server | כן | URL ציבורי של השרת (בשימוש ב־URLs חתומים של segments). |
| `RENDER_URL_EXPIRY_SECONDS` | server | לא | TTL של URL פלט חתום. ברירת מחדל: `86400` (יום אחד) |
| `JOB_PROGRESS_TTL_SECONDS` | server | לא | TTL של Redis job. ברירת מחדל: `600` (10 דקות) |
| `VITE_EDITOR_PARENT_ORIGINS` | frontend | לא | origins מותרים של iframe מופרדים בפסיקים. ברירת מחדל היא `window.location.origin`. |
