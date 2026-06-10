# ADR 0006: התאוששות חיבור מובנית של amqplib עבור publisher ו־consumer

- סטטוס: התקבל
- תאריך: 2026-06-02

## קונטקסט

`apps/server` משתמש ב־amqplib 2.0.1. ה־publisher (`RabbitMQPublisher`) נשא
לולאת reconnect ידנית עם backoff קבוע `[1s, 2s, 5s, 10s]` מוגבל ל־
30s, ללא jitter, ללא מגבלת retry, ונתיב נוסף של "סגור-ופתח מחדש את
החיבור על כל שגיאת publish חולפת" בתוך `publishWithRetry`. ה־
consumer (`RabbitMQConsumer`) קיבל לולאה ייעודית דומה (לאחר merge) אך היא
הייתה לפני שכתוב ה־publisher ופעלה רק דרך אירועי סגירת channel/connection;
שיבוש broker חולף במהלך חלון האתחול של ה־worker יכל להותיר אותו תקוע עד
ש־k8s יבחין.

amqplib שלח התאוששות מהשורה ב־v1.1.0 (`connect(url, { recovery })`
מחזיר `RecoveringChannelModel` עם אירועי `connect` / `disconnect` /
`reconnect-scheduled` / `reconnect-failed` / `error` / `handler-error`
מתועדים וחושף callback `setup` שרץ מחדש בכל חיבור — ראשוני ו
עוקב). משטח ה־handler-error (v1.0.7) ו־channel-close מובנה
(v1.0.6) דורשים שיתוף פעולה מהאפליקציה כדי להיות שימושיים.

## החלטה

החלף את שתי הלולאות הייעודיות ב־`connect(url, { recovery: { initialDelay:
1s, maxDelay: 30s, factor: 2, jitter: 0.2, maxRetries: Infinity, setup } })`.
הצהרת טופולוגיה רצה ב־callback של `setup` כך שהיא מצהירה מחדש בכל
reconnect. השלך את ה־branch של סגור-ופתח-מחדש בתוך `publishWithRetry` (התאוששות
מטפלת ב־reconnect; אנחנו רק עושים retry על ה־channel הבא) והקטן את
לוח backoff לכל הודעה ל־`[200ms, 1s]`. חבר handlers של `handler-error`
על מודל ההתאוששות ועל כל channel. הצף `code`/`classId`/`methodId` של
AMQP בלוגי שגיאה.

Fail-fast באתחול נשמר דרך שני מנגנונים משלימים כי
`maxRetries: Infinity` משמעו ש־`connect(...)` לעולם לא דוחה על broker שאינו
נגיש לצמיתות (ה־`_scheduleReconnect` של עטיפת ההתאוששות דוחה את
ה־promise הראשוני רק כש־`_attempt >= maxRetries`):

1. probe `connect(url)` פשוט (ללא התאוששות) רץ ראשון כדי לתפוס URL רע,
   credentials רעים והצהרות טופולוגיה רעות — הכשלים האלה מופיעים נקי
   באתחול במקום להיבלע על ידי לולאת ה־retry האינסופית.
2. ה־connect המתאושש אז מתחרה מול `AMQP_INITIAL_CONNECT_TIMEOUT_MS`
   (ברירת מחדל 15s) כך ש־brokers לא נגישים גורמים לתהליך לצאת ול־k8s
   להפעיל מחדש את ה־pod.

`ChannelClosedError` דוחה promises של publish בטיסה כש־channel נסגר
באמצע publish. ה־handler של `ch.on('close')` עושה snapshot של `inflight` לפני
איטרציה כך ש־handler של settle שמכניס מחדש ל־`publish()` לא יכול לבטל
את האיטרציה. אירועים מקבלים `EVENT_PUBLISH_CONFIRM_TIMEOUT_MS` (ברירת מחדל 30s)
כך שאירוע שהאישור של ה־broker שלו לעולם לא מגיע לא יתקע לנצח (לפקודות כבר היה
`COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS`).

## השלכות

חיוביות:
- Consumer מתאושש עצמית — שיבושי broker כבר לא דורשים restart של pod worker.
- מדיניות backoff / jitter יחידה על פני publisher ו־consumer.
- טופולוגיה מוצהרת מחדש בכל reconnect; reconnect לאחר שדרוג broker
  שאיבד הצהרות תורים עכשיו בטוח.
- handlers של `handler-error` מציפים זריקות סינכרוניות ש־amqplib pre-v1.0.7
  בלע בשקט.
- שדות שגיאה מובנים של AMQP (`code`/`classId`/`methodId`) מופיעים בלוגים.

שליליות / פשרות:
- ה־probe של האתחול פותח חיבור AMQP קצר-מועד נוסף. עלות מקובלת
  לאבחון fail-fast.
- timeout שני (סבב initial-connect) נדרש כדי לפצות על
  `maxRetries: Infinity`; מתועד בקוד + CLAUDE.md.
- Publish במהלך חלון ה־reconnect ממתין ל־deferred של `channelReady` במקום
  לזרוק מיד. מוגבל על ידי `EVENT_PUBLISH_CONFIRM_TIMEOUT_MS` /
  `COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS`.
- לוגי `reconnect-scheduled` הם rate-limited (ניסיון 1 + כל 10) כדי להימנע
  מהצפת לוגים במהלך תקלות מתמשכות.

## אימות

טסטי אינטגרציה ב־
`apps/server/src/infrastructure/messaging/__tests__/RabbitMQPublisher.test.ts`
מכסים את timeout של initial-connect מול broker תקוע, reconnection לאחר
סגירת מודל פנימית כפויה, backoff על setup-failure (stub של טופולוגיה זורק פעם אחת,
התאוששות עושה retry עם delay, ואז מצליחה), settle של `ChannelClosedError` על
סגירת channel באמצע publish, ו־`handler-error` הן על handlers של `close` והן `return`
(האחרון מפעיל את נתיב `entry.settle` שסומן ב־audit).
