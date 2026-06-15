# תחילת עבודה

מ-clone להרצה מקומית של כל ה-stack.

## דרישות מקדימות

- Node.js **22.18+**. השרת מריץ TypeScript ישירות; אין `tsx` או שלב build בפיתוח.
- pnpm **10+**. ניהול חבילות ב-pnpm בלבד — אסור `npm`.
- Docker. נחוץ ל-MinIO ו-RabbitMQ.

FFmpeg מסופק דרך `@ffmpeg-installer/ffmpeg`. אין צורך בהתקנת מערכת.

## הרצה

```bash
pnpm install
docker compose up -d
cp apps/server/.env.example apps/server/.env
pnpm dev
```

`docker compose up -d` מעלה את MinIO (פורטים 9000/9001) ו-RabbitMQ (5672, ניהול ב-15672). `pnpm dev` מריץ את כל האפליקציות במקביל דרך Turborepo.

ברירות מחדל של `.env` עובדות לפיתוח מקומי. לפירוט מלא של env: [apps/server](apps/server).

## URLs ברירת מחדל

| אפליקציה | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Server API | http://localhost:4001 |
| iframe demo | http://localhost:8080 |
| core-mock | http://localhost:8002 |
| mock-vod | http://localhost:5050 |
| קונסולת MinIO | http://localhost:9001 |
| קונסולת RabbitMQ | http://localhost:15672 |
| Swagger UI של ה-API | http://localhost:4001/docs |

MinIO defaults: `minioadmin` / `minioadmin123`.

## env אופציונלי של frontend

- `VITE_EDITOR_PARENT_ORIGINS` — origins מותרים מופרדים בפסיקים עבור iframe `postMessage`. מוגדר כשמטמיעים את העורך בדף ממקור שונה. ברירת מחדל: `window.location.origin`.

## בדיקות לפני push

```bash
pnpm lint
turbo run type-check
pnpm test
pnpm knip
```

ארבע הפקודות חייבות לעבור.

## מקורות

- `README.md` בשורש המאגר
- [CLAUDE.md](https://github.com/Zetro-Crew/video-editor/blob/main/CLAUDE.md)
- `apps/server/.env.example`
