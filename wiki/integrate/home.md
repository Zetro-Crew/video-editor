# Integrate

איך צוותים חיצוניים מתחברים לעורך.

- **[iframe](iframe)** — אפליקציית הורה מטמיעה את העורך ב-`/editor/embed` ומפעילה אותו דרך `postMessage`.
- **[אירועי AMQP](events)** — צוות חיצוני קושר תור ל-topic exchange `video-editor` וצורך אירועי `export.*`.

שני המסלולים מבוססים על `@video-editor/contract` — סכמות Zod + טיפוסי TypeScript. התקן אותה כמו כל תלות פנימית (`pnpm add @video-editor/contract@<version>`). **אסור לשכפל את המאגר הזה כדי לצרוך את החבילה.**

## מקורות

- [packages/contract](../dev/apps/contract)
- Swagger UI ב-`${SERVER_BASE_URL}/docs`
