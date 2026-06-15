# Dev

תיעוד הצוות שבונה את העורך — וגם מי שמצטרף ורוצה להבין את הקוד.

## התחלה מהירה

חדש בפרויקט: [תחילת עבודה](getting-started). מבנה הקוד: [סיור במאגר](repo-tour). איך עובדים מול ה-monorepo: [תהליך עבודה](workflow).

## ארכיטקטורה

- [סקירה](overview) — תרשימי מערכת, זרימת ייצוא, זרימת preview.
- [מילון מונחים](glossary) — הגדרות של כל מונח שחוזר בקוד ובדיונים. כולל גם מונחי UI וגם מונחים טכניים.
- [ADRs](adr-index) — אינדקס החלטות ארכיטקטוניות. הקבצים המלאים חיים ב-`docs/adr/` של המאגר.

## פירוט לכל אפליקציה

- [frontend](apps/frontend) — Vite + React 19 SPA, פורט 3000.
- [server](apps/server) — Fastify + Node.js. API על 4001, Worker על 8081.
- [contract](apps/contract) — חבילת `@video-editor/contract`. סכמות Zod ל-iframe, אירועים ופנים-שרת.
- [dev harness](apps/dev-harness) — `iframe-demo`, `core-mock`, `mock-vod`. כלי פיתוח, לא ייצור.

## מקורות

- [CLAUDE.md](https://github.com/Zetro-Crew/video-editor/blob/main/CLAUDE.md)
- [docs/architecture.md](https://github.com/Zetro-Crew/video-editor/blob/main/docs/architecture.md)
