# הגדרת סביבת פיתוח

הגדרת סביבה מקומית עבור ה־monorepo של video-editor.

## דרישות מקדימות

- Node.js **22.18+** (TypeScript מורץ ישירות על ידי Node — אין `tsx`/`ts-node`).
- pnpm **10+**.
- Docker (עבור MinIO + RabbitMQ).

## הפעלת תשתיות

```bash
docker compose up -d
```

זה מפעיל את MinIO (אחסון תואם S3, פורטים `9000`/`9001`) ו־RabbitMQ (`5672`, ממשק ניהול ב־`15672`). אישורי MinIO ברירת מחדל: `minioadmin` / `minioadmin123`.

## הגדרת השרת

```bash
cp apps/server/.env.example apps/server/.env
```

ברירות המחדל עובדות לפיתוח מקומי; ה־schema המלא של env מתועד ב־[architecture/apps/server](../architecture/apps/server).

## הרץ הכול

```bash
pnpm install
pnpm dev
```

Turborepo מריץ את כל האפליקציות במקביל.

## URLs ברירת מחדל

| אפליקציה | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Server API | http://localhost:4001 |
| Iframe demo | http://localhost:8080 |
| Core mock | http://localhost:8002 |
| Mock VOD | http://localhost:5050 |
| קונסולת MinIO | http://localhost:9001 |
| קונסולת RabbitMQ | http://localhost:15672 |

## env אופציונלי של frontend

- `VITE_EDITOR_PARENT_ORIGINS` — origins מותרים מופרדים בפסיקים עבור iframe `postMessage` (הגדר כשמטמיעים את העורך בדף של origin אחר).
