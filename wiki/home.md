# Video Editor — Wiki

עורך וידאו רץ בדפדפן, מיועד לפריסה ברשת סגורה. monorepo עם frontend (React), server (Fastify), חוזה משותף (Zod) ו-mocks לפיתוח. הוויקי מתחזק ידנית בעברית, מסונכרן בעת הצורך ל-`<project>.wiki.git`.

## ניווט

- **[Dev](dev/home)** — קליטה, ארכיטקטורה, מילון מונחים, ADRs, פירוט לכל אפליקציה.
- **[Integrate](integrate/home)** — איך אפליקציית הורה מטמיעה את העורך ב-iframe, ואיך צוות חיצוני צורך אירועי AMQP.
- **[Operate](operate/home)** — פריסה לרשת סגורה, ניטור, runbooks.

## מה העורך עושה

- ציר זמן רב-tracks עם drag, חיתוך, גזירה, סידור מחדש.
- Preview חי מדויק לפריים בזמן עריכה (Remotion Player).
- מקורות תוכן: recording range מערוץ מנוהל, העלאת קובץ, mediaId מאוחסן, track אודיו, URL HLS שרירותי.
- Transitions, אנימציות, טקסט וצורות מעל וידאו, modal חיתוך.
- ייצוא ל-MP4 או WebP מונפש. רץ אסינכרונית בשרת — המשתמש לא ממתין; אירועי AMQP מודיעים לצרכנים מורדים.
- הטמעה ב-iframe: כל אפליקציית host טוענת את העורך ב-`/editor/embed` ושולחת/מקבלת הודעות `postMessage` מובנות.
- Single sign-on דרך עוגיית `ztube-token` (`HttpOnly`) של ה-host — העורך לא רואה את ה-token, רק נותן לדפדפן לצרף אותו.

## מה העורך לא עושה

- לא מאחסן את הפלט הסופי לטווח ארוך. שירותי מורדים מטפלים, מופעלים על ידי `export.completed`.
- לא מבצע transcode במהלך preview — המקור מוזרם דרך proxy בצד שרת עם token מוזרק.
- לא מספק חשבונות, הרשאות או ניהול ערוצים — מגיעים מאפליקציית ה-host.

## מקורות

- [README.md](https://github.com/Zetro-Crew/video-editor/blob/main/README.md)
- [CLAUDE.md](https://github.com/Zetro-Crew/video-editor/blob/main/CLAUDE.md)
- [docs/adr/](https://github.com/Zetro-Crew/video-editor/tree/main/docs/adr)
