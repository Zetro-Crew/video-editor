# סיור במאגר

מדריך זה משקף את התוכן של `CLAUDE.md` בשורש המאגר ומתעד את מבנה ה־monorepo עבור מפתחים שמצטרפים.

**פריסת רשת סגורה:** ייצור רץ בסביבות רשת סגורות ומבודדות (air-gapped) ללא גישת אינטרנט ציבורית. כל התלויות חייבות להיות self-hosted או מסופקות. אל תכניס קישורי CDN חיצוניים, קריאות API ציבוריות או משיכות בזמן ריצה ל־URLs ציבוריים.

## מבנה Monorepo

monorepo של pnpm + Turborepo. השורש של ה־workspace הוא `apps/*` ו־`packages/*`.

```
apps/
  frontend/    — Vite + React 19 + React Router v7 (port 3000)
  server/      — Fastify + Node.js (port 4000)
  iframe-demo/ — Angular 21 demo harness for iframe integration (port 8080)
  core-mock/   — Fastify mock of the Core service (port 8002)
  mock-vod/    — Fastify mock of the VOD service (port 5050)
packages/
  contract/         — shared postMessage + AMQP event contract (@video-editor/contract)
```

`core-mock` ו־`mock-vod` מתאמים דרך `POST /__internal/register-token` כך ש־`vod-token` cross-service trust משקף את הקשר האמיתי של Core/VOD. ראה [ADR 0002](../architecture/adr/0002-mock-vod-as-separate-app).

הדרכה לכל אפליקציה:
- [frontend](../architecture/apps/frontend)
- [server](../architecture/apps/server)
- [iframe-demo](../architecture/apps/iframe-demo)
- [mock-vod](../architecture/apps/mock-vod)
- [contract](../architecture/apps/contract)

## כללי מאגר

- runtime של השרת הוא Node.js `22.18+`.
- השתמש ב־`pnpm` לכל ניהול חבילות. הוסף תלויות עם `pnpm add` או `pnpm add -D`, ואל תשתמש ב־`npm`.
- השתמש רק ב־imports עם `.ts` ולא `.js`.
- TypeScript של השרת מורץ ישירות עם Node.js. אל תכניס `tsx`/`ts-node` להרצת אפליקציה רגילה.
- אחרי כל prompt מושלם, הרץ את הבדיקות האלה לפני סיום:
  ```bash
  pnpm lint
  turbo run type-check
  pnpm test
  pnpm knip
  ```

## פילוסופיית פיתוח

מעדיפים TDD: red → green → refactor. טסט אחד בכל פעם, vertical slices בלבד — לעולם לא לכתוב את כל הטסטים ואז את כל הקוד.

- כתוב טסט נכשל אחד להתנהגות אחת, הטמע קוד מינימלי לעבור, חזור.
- טסטים מאמתים התנהגות דרך ממשקים ציבוריים, לא פרטי מימוש. טסטים חייבים לשרוד refactors פנימיים.
- אין mocking של משתפי פעולה פנימיים. השתמש בנתיבי קוד אמיתיים.

## פקודות

```bash
# Root — runs both apps in parallel via Turborepo
pnpm dev
pnpm lint
pnpm build

# Per-app
cd apps/frontend    && pnpm dev
cd apps/server      && pnpm dev    # node runs TypeScript directly in watch mode
cd apps/iframe-demo && pnpm dev    # Angular dev server on port 8080

# Type check
cd apps/frontend && pnpm exec tsc --noEmit
cd apps/server   && pnpm exec tsc --noEmit

# Format (biome)
pnpm format

# Tests (Vitest)
cd apps/server && pnpm test   # vitest run
cd packages/contract && pnpm test   # builds then runs dist/**/*.test.js
```

## הגדרת פיתוח מקומי

MinIO (אחסון תואם S3) ו־RabbitMQ חייבים להיות פעילים לפני שהאפליקציה עובדת:

```bash
docker compose up -d
```

הגדר את `apps/server/.env`. ה־frontend לא צריך `.env` בפיתוח. השרת מגדיר ברירת מחדל ל־`http://localhost:4001`. Vite מבצע proxy ל־`/render`, `/editor` ו־`/upload` אליו במהלך פיתוח מקומי. העלאות משתמשות בזרימת presigned-URL: הלקוח מבקש URL חתום מ־`/upload/signed-url`, ואז מבצע PUT של הקובץ ישירות ל־MinIO ב־`http://localhost:9000` (CORS של MinIO ב־`docker-compose.yml` מתיר `http://localhost:3000` ו־`http://localhost:8080`).

**env אופציונלי של frontend:**
- `VITE_EDITOR_PARENT_ORIGINS` — origins מותרים מופרדים בפסיקים עבור iframe postMessage (נדרש כשמטמיעים את העורך ב־iframe).

## ארכיטקטורה

### Frontend (`apps/frontend`)

Vite + React 19 SPA על פורט 3000. התכונה המרכזית היא `src/features/editor/` — ממשק המשתמש המלא של עריכת וידאו עם canvas של סצנה (Moveable/Selecto), ציר זמן (`@designcombo/timeline`), Remotion `<Player>` ו־panels של מאפיינים לכל סוג. State דרך 8 stores של Zustand. תומך בהטמעת iframe דרך hook של `useEditorPostMessage`.

→ ראה [architecture/apps/frontend](../architecture/apps/frontend) לפירוט המלא.

### Server (`apps/server`)

Fastify + Node.js 22.18+. שני entrypoints, image אחד:

- **API** על פורט 4001 (`src/index.ts`) — HTTP בלבד. מכניס לתור פקודות רינדור על תור RabbitMQ.
- **Worker** על probe פורט 8081 (`src/worker.ts`) — צורך את התור, מריץ FFmpeg, מפרסם אירועי מחזור חיים.

עוקב אחר **ארכיטקטורה הקסגונלית** (Ports & Adapters): תכונות חיות ב־`src/features/<name>/` עם `adapters/inbound/{http,amqp}/`, `adapters/outbound/{ffmpeg,s3,amqp,http}/`, `application/use-cases/` ו־`domain/`. טיפוסי domain משותפים ו־ports ב־`src/shared/`. Adapters של תשתית ב־`src/infrastructure/`.

שלוש תכונות: `upload`, `render`, `preview`.

Routes (API):
| Method | Path | Feature |
|--------|------|---------|
| POST | `/upload/signed-url` | upload |
| POST | `/render` | render — מחזיר 202 `{ id }`; 503 אם broker לא זמין. אין endpoint של GET — לקוחות עוקבים אחר מחזור החיים דרך אירועי AMQP `export.*` |
| POST | `/editor/preview-source` | preview |
| GET | `/editor/segment` | preview |
| GET | `/editor/demo-assets/:filename` | preview |

מניפסטים של Worker חיים ב־`deploy/worker/`. ראה [ADR 0005](../architecture/adr/0005-render-worker-deployment).

→ ראה [architecture/apps/server](../architecture/apps/server) לפירוט המלא.

### Iframe Demo (`apps/iframe-demo`)

אפליקציית Angular 21 standalone על פורט 8080. מטמיעה את `/editor/embed` ב־iframe צף, נגרר ובר־שינוי גודל. מספקת לוח שליטה לשליחת הודעות `EDITOR_ADD_PREVIEW_ITEM` ו־`EDITOR_CLEAR_PROJECT` ומציגה תגובות. ה־harness העיקרי לבדיקת אינטגרציית ה־iframe.

→ ראה [architecture/apps/iframe-demo](../architecture/apps/iframe-demo) לפירוט המלא.

### חבילה: contract (`packages/contract`)

מתפרסמת כ־`@video-editor/contract`. שני sub-paths:
- `/iframe` — סכמות Zod + טיפוסים עבור פרוטוקול postMessage עורך↔הורה.
- `/events` — `Envelope<T>` מגורסם + סכמות Zod עבור אירועי AMQP שמפורסמים ל־topic exchange של `video-editor` (`export.started`, `export.completed`, `export.failed`). צוותים חיצוניים קושרים תורים מול ה־exchange הזה ומייבאים סכמות מ־`/events` לאימות בצד הצרכן.

הייצוא השורשי (`@video-editor/contract`) מייצא מחדש את `iframe` + `SavedMediaItem`/`SavedMediaPayload` משותפים.

→ ראה [architecture/apps/contract](../architecture/apps/contract) לפירוט המלא ואת [integrators/event-consumers](../integrators/event-consumers) למסמך onboarding של הצרכן.

## תלויות חיצוניות מרכזיות

- **`@designcombo/*`** — חבילות קנייניות (state, timeline, transitions, animations, frames, events, types). מרכזיות להתנהגות העורך.
- **Remotion** — מנוע הרכבת וידאו. `@remotion/player` מרנדר את ה־preview של ה־canvas בדפדפן.
- **`@ffmpeg-installer/ffmpeg`** — binary FFmpeg מסופק (לא נדרשת התקנת מערכת). השרת משתמש ב־`spawn` גולמי לכל עיבוד FFmpeg.
- **`@fastify/multipart`** — טיפול בהעלאת קבצים (מגבלה של 500 MB).
- **`@ztube/observability`** — חבילה חיצונית (במאגר נפרד, מותקנת מהרג'יסטרי הפנימי) שמספקת tracing/metrics של OpenTelemetry, logging מובנה של Pino ו־profiling של Pyroscope עבור server + worker.

## Wiki

תיקיית `wiki/` בשורש המאגר היא הוויקי של פרויקט GitLab, מעוצבת לרשת הסגורה. המפעיל מעתיק את התוכן שלה למאגר `<project>.wiki.git` ידנית בעת הצורך.

הוויקי מתוחזק ידנית בעברית. התוכן מבוסס על קבצי המקור (`README.md`, `CLAUDE.md`, `CONTEXT.md`, `docs/architecture.md`, `docs/adr/*.md`, `apps/*/README.md`, `packages/*/README.md`) אבל אינו נוצר אוטומטית — סנכרון נעשה ידנית.

## כישורי סוכן

### Issue tracker

GitHub Issues ב־`danielrispler/react-video-editor` (עדיין לא בשימוש פעיל; מוגדר לשימוש עתידי). ראה `docs/agents/issue-tracker.md`.

### Triage labels

מחרוזות קנוניות ברירת מחדל (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). ראה `docs/agents/triage-labels.md`.

### מסמכי Domain

קונטקסט יחיד — `CONTEXT.md` אחד + `docs/adr/` בשורש המאגר. ראה `docs/agents/domain.md`.
