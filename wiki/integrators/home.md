# מתממשקים

הגעת לכאן אם הצוות שלך **מטמיע את ה־iframe של העורך** באפליקציית הורה, **צורך אירועי AMQP** שהעורך מפרסם, או שניהם. שני המשטחים מתוארים בסכמות Zod שמסופקות ב־`@video-editor/contract`, חבילה שמתפרסמת ל־registry הפנימי — מתקינים אותה כמו כל תלות פנימית אחרת.

## דפים

- [הטמעת iframe](iframe-integration) — הטמעת העורך, הפעלה שלו עם `postMessage`, טיפול בתגובות.
- [צרכני אירועים](event-consumers) — קישור תור ל־exchange של `video-editor` ותגובה לאירועי `export.*`.

## איך להשיג את הסכמות

שני הדפים מניחים ש־`@video-editor/contract` זמין ב־registry הפנימי שלך. הוסף אותו לשירות שלך:

```bash
pnpm add @video-editor/contract@<version>
```

נעל את הגרסה. החבילה חושפת את ה־subpaths הציבוריים הבאים:

| Subpath | מקרה שימוש |
|---|---|
| `@video-editor/contract/iframe/from-parent` | הודעות הורה → עורך (אתה שולח) |
| `@video-editor/contract/iframe/to-parent` | הודעות עורך → הורה (אתה מקבל) |
| `@video-editor/contract/events` | מעטפות אירועי RabbitMQ (אתה צורך) |

> ה־subpath `internal/*` הוא פרטי לשרת. אסור לייבא אותו מקוד מתממשק — אלו סכמות בקשות HTTP פנימיות של שרת העורך ועלולות להישבר בין גרסאות ללא הודעה מראש.
