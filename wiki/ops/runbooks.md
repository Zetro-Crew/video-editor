# Runbooks

תבניות אירוע נפוצות שנגזרות מנתיבי השגיאה של המערכת. אלה playbooks **גנריים** שנבנו מהקוד, לא תיעוד של אירועים קודמים — חדד כל אחד עם נתונים אמיתיים ככל שתצבור.

מילון מונחי ניטור/לוג בשימוש כאן: [monitoring](monitoring). הפניות צולבות ברמת ארכיטקטורה: [glossary](../architecture/glossary), [ADR 0005](../architecture/adr/0005-render-worker-deployment), [ADR 0006](../architecture/adr/0006-amqplib-built-in-recovery).

---

## 1. `POST /render` מחזיר 503

**סימפטום.** אפליקציות מתממשקות רואות התפרצות של תגובות `503` מ־`/render`. כפתור הייצוא ב־frontend מדווח על כשל.

**משמעות.** `publishCommand` מיצה את תקציב 3 הניסיונות שלו ללא אישור broker. ה־controller ממפה את זה ל־`503` (פקודות לא יכולות להיבלע בשקט — הלקוח חייב לדעת). ראה [ADR 0005](../architecture/adr/0005-render-worker-deployment) ו־[ADR 0006](../architecture/adr/0006-amqplib-built-in-recovery).

**בדוק.**

1. pod של RabbitMQ פעיל ומקבל חיבורים.
2. mounts של קבצי PEM ל־mTLS קיימים וקריאים בכל pod של API:
   - `/bundle.pem`
   - `/tmp/certificates/rabbitmq/rabbit_cert.pem`
   - `/tmp/certificates/rabbitmq/rabbit_key.pem`
3. סכמת `QUEUE_URL`: `amqps://` בייצור. `amqp://` כאן ידלג על קריאת הקבצים בשקט.
4. לוגי pod של API עבור `reconnect-scheduled` (broker לא נגיש) או `ChannelClosedError` (סגירת ערוץ באמצע publish) או `PublishExhaustedError`.
5. האם ה־exchange `video-editor.commands` והתור `render.requested` קיימים ויש להם את ההגדרה הצפויה. השרת מצהיר עליהם בעת חיבור — `PRECONDITION_FAILED` כאן משמעו drift בטופולוגיה.

**מתן.** שחזר את ה־broker. ה־publisher מתאושש עצמית דרך עטיפת ההתאוששות של amqplib; אין צורך ב־restart של pod API.

---

## 2. רינדור תקוע — job יושב ב־`export.started` לנצח

**סימפטום.** מתממשקים מקבלים `export.started` עבור `jobId` אבל לעולם לא רואים `export.completed` או `export.failed`.

**משמעות.** ה־worker אולי קרס באמצע רינדור, או שהרינדור באמת ארוך. שים לב ש־`export.started` עשוי לירות מספר פעמים עבור אותו `jobId` (broker redelivery); בצע dedupe לפני שתניח "תקוע".

**בדוק.**

1. pods של Worker פעילים (`kubectl get pods -l service=video-editor-worker`).
2. עומק תור `render.requested` — backlog משמעו workers עסוקים, לא תקועים.
3. צרכני `render.requested` > 0. אם 0, כל רינדור יתקע עד ש־worker יחזור.
4. לוגים של Worker עבור ה־`jobId` (שדה `businessId`): חפש קריסות ילד של FFmpeg, `OOMKilled`, או פגיעות ב־`TRANSCODE_TIMEOUT_MS` (ברירת מחדל 2 שעות).
5. אם ה־pod של Worker נכבה ב־`SIGKILL` (גבול משאבים, פינוי, רינדור תקוע מעבר ל־`terminationGracePeriodSeconds=600`), ההודעה נמסרת מחדש; כל SIGKILL נספר לעבר `x-delivery-limit=5`. אחרי 5 → DLQ → `export.failed { error: "max retries exceeded" }` סופי.

**מתן.** אם ה־worker באמת תקוע ולא מתקדם, מחק את ה־pod. K8s יקים תחליף; ההודעה תימסר מחדש. אם הרינדור גדול מדי עבור מגבלות המשאבים, העלה `cpu`/`memory` ב־`deploy/worker/deployment.yaml`.

---

## 3. DLQ מצטבר (`render.dead.messages_ready > 0`)

**סימפטום.** התראה על עומק תור `render.dead`.

**משמעות.** רינדור פגע ב־`x-delivery-limit=5` ועבר ל־dead-letter. צרכן ה־DLQ של ה־worker כבר פרסם `export.failed { error: "max retries exceeded" }` סופי למתממשקים — אין סיגנל סופי חסר. זו אזעקת איכות, לא אזעקת נכונות.

**בדוק.**

1. לוגים של Worker מסוננים לפי ה־`jobId`s ב־DLQ. חמישה כשלים רצופים על אותו job — סיבת הכשל נמצאת בלוגים האלה.
2. סיבות שורש נפוצות:
   - קריסת FFmpeg על מקור מעוות (חפש `Invalid data`, `moov atom not found` וכו').
   - כשל כתיבת S3 (`Access Denied`, timeout של רשת).
   - OOM של pod במהלך הרינדור (jobs מעל מגבלת הזיכרון נכשלים בעקביות).
3. אם הרבה jobs נפרדים ב־DLQ, הבעיה מערכתית (מגבלות משאבים, תקלת S3, או רגרסיה). אם job אחד ב־DLQ פעמים רבות... זה לא חוזר על עצמו; ברגע שמת, מת. jobIds נפרדים ב־DLQ הם הצורה הצפויה.

**מתן.** רוקן את ה־DLQ ברגע שסיבת השורש תוקנה. האירועים הסופיים כבר נמסרו לצרכנים; הודעות ה־DLQ עצמן הן רישום בלבד.

---

## 4. Segments של preview מחזירים 401 באמצע נגינה

**סימפטום.** משתמש פותח preview, מנגן זמן מה, ואז segments מתחילים להחזיר `401`. או: playlist שמור עובד עבור המשתמש הראשון, נכשל עבור השני.

**משמעות.** ה־`vod-token` שצרוב לתוך URLs של segments ב־HLS playlist פג. TTL ברירת מחדל הוא ~10 דקות; ה־playlist עצמו מאוחסן ב־S3 ושורד מעבר ל־token. השהיה/חוסר פעילות מעבר ל־TTL ו־segments נכשלים. ה־footgun הזה משוקף ב־[CLAUDE.md של mock-vod](../architecture/apps/mock-vod) ומופיע גם מקומית.

**בדוק.**

1. חפש `401` מ־VOD במעלה הזרם בלוגי proxy של `/editor/segment`.
2. השווה את גיל ה־playlist (`LastModified` של S3) מול TTL של ה־token.

**מתן.** ייצר מחדש את ה־playlist על ידי קריאה חוזרת ל־`POST /editor/preview-source` (ה־frontend של העורך עושה זאת אוטומטית כשהמשתמש פותר מחדש את ה־preview). לטווח ארוך: העלה את TTL של ה־VOD token במעלה הזרם אם דפוסי התעבורה שלך כוללים חלונות idle ארוכים.

---

## 5. אזהרות `unrouted` בלוגי publisher

**סימפטום.** רשומות לוג שמראות שה־broker החזיר הודעה שפורסמה כ־unroutable.

**משמעות.** ה־publisher משתמש ב־`mandatory: true`. החזרה "unrouted" משמעה שה־broker קיבל את ההודעה אבל לא מצא תור קשור ל־routing key. השרת מתייחס לזה ככשל פרסום (נרשם + נמדד).

**בדוק.**

1. איזה routing key? `export.*` (אירועים) או `render.requested` (פקודה)?
2. לאירועים: תור של צוות צרכן חסר או לא יותר קשור ל־`video-editor`. הצוות שלהם מחזיק את ה־binding.
3. ל־`render.requested`: ה־worker לא מצהיר על הטופולוגיה. בדוק את לוגי האתחול של ה־worker — `assertExchange`/`assertQueue` צריכים להצליח. אם ה־broker דוחה עם `PRECONDITION_FAILED`, התור קיים עם ארגומנטים שלא מתאימים (לעיתים קרובות drift של `x-delivery-limit` או `x-message-ttl`).

**מתן.** שחזר את ה־binding החסר (בצד הצרכן) או צור מחדש את התור עם הארגומנטים הצפויים (בצד הפקודות — תאם עם מי שמחזיק את הפריסה). ה־publisher ינסה שוב בניסיון הבא.

---

## 6. חיבור broker בלולאה (`reconnect-scheduled` ספאם)

**סימפטום.** לוגים מתמלאים באירועי `reconnect-scheduled`. שים לב שהם rate-limited — ניסיון 1 + כל 10 — אז ספאם מתמשך משמעו תקלה ממושכת.

**משמעות.** ה־broker לא נגיש. עטיפת ההתאוששות של amqplib עושה את העבודה עם `factor: 2`, `maxDelay: 30s`, `jitter: 0.2`, `maxRetries: Infinity`.

**בדוק.**

1. בריאות pod של broker, מדיניות רשת, תפוגת תעודת mTLS.
2. `AMQP_INITIAL_CONNECT_TIMEOUT_MS` (ברירת מחדל 15s) הוא מה שגורם לשרת להיכשל מהר באתחול. אחרי האתחול זה שטח של לולאת ההתאוששות.
3. `EVENT_PUBLISH_CONFIRM_TIMEOUT_MS` (ברירת מחדל 30s) ו־`COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS` (ברירת מחדל 10s) קובעים כמה זמן publish בטיסה ממתין במהלך חלון ההתחברות מחדש לפני שהוא נכשל.

**מתן.** שחזר את ה־broker. publisher ו־consumer מתרפאים עצמית; אין צורך ב־restart של pod. רקע: [ADR 0006](../architecture/adr/0006-amqplib-built-in-recovery).

---

## 7. כשל `S3_AUTO_CREATE_BUCKET` באתחול API

**סימפטום.** pod של API ב־CrashLoopBackOff מיד אחרי deploy. לוגים מראים כשל יצירת bucket של S3.

**משמעות.** ה־`S3_ACCESS_KEY_ID` המוגדר חסר `s3:CreateBucket` (או מדיניות IAM המקבילה ב־MinIO), ו־`S3_AUTO_CREATE_BUCKET=true` (ברירת מחדל). השרת מסרב להתחיל ללא bucket שמיש.

**מתן.** שתי אפשרויות:

1. צור את ה־bucket מראש והגדר `S3_AUTO_CREATE_BUCKET=false`. מומלץ בייצור — מחזור חיים של bucket לא צריך להיות דאגה של זמן ריצה.
2. תן הרשאת יצירת bucket לאישורי S3 של ה־API.

---

## 8. כיבוי Worker לוקח זמן רב

**סימפטום.** rolling deploy תקוע על סיום pod של worker. ה־pod נשאר ב־`Terminating` לכמה דקות.

**משמעות.** זו **התנהגות צפויה**. `terminationGracePeriodSeconds: 600` מאפשר לרינדור בטיסה לסיים לפני SIGKILL. רצף הכיבוי: בטל consumer → המתן עד 540s לבטיסה → drain ה־publisher (5s) → סגור publisher → עצור שרת probe. זו לא דליפה.

**בדוק.** חקור רק אם הכיבוי עולה על 600s. זה ימשמע ש־SIGKILL נורה לפני ש־publisher הסתיים; אישורי broker בטיסה אולי אבדו. ההודעה תימסר מחדש ל־worker אח, אז זה עלות ספירת מסירה, לא עלות נכונות.

---

## 9. חוסר התאמה בפורט probe של Worker

**סימפטום.** pod של Worker נכשל מיד ב־readiness/liveness probes אחרי deploy. K8s מדווח שה־endpoint של ה־probe לא נגיש.

**משמעות.** ה־`deploy/worker/configmap.yaml` ה־committed מגדיר `WORKER_PROBE_PORT: "8080"` בעוד ש־`deployment.yaml` חושף `containerPort: 8081`. אם הסביבה שלך לא הסכימה ביניהם, ה־probe מכוון לפורט אחד והתהליך מאזין לאחר.

**מתן.** בחר ערך אחד, הגדר אותו בעקביות בשני הקבצים (ו־`service.yaml` אם אתה proxy אותו), פרוס מחדש. הקוד עצמו מוגדר ל־`8081` כברירת מחדל.
