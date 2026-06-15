# Runbooks

תבניות אירוע נפוצות שנגזרו מנתיבי השגיאה בקוד. **גנריות** — חדד עם נתונים אמיתיים בעת שתצבור.

הפניות: [ניטור](monitoring), [מילון מונחים](../dev/glossary), [ADR 0005](../dev/adr-index), [ADR 0006](../dev/adr-index).

## 1. `POST /render` מחזיר 503

**סימפטום.** אפליקציות מתממשקות רואות `503` מ-`/render`. כפתור הייצוא ב-FE מדווח כשל.

**משמעות.** `publishCommand` מיצה את תקציב 3 הניסיונות שלו ללא אישור broker. ה-controller ממפה ל-`503` (פקודות לא נבלעות בשקט — הלקוח חייב לדעת).

**בדוק.**

1. pod של RabbitMQ פעיל ומקבל חיבורים.
2. PEMs ל-mTLS קיימים וקריאים בכל pod של API: `/bundle.pem`, `/tmp/certificates/rabbitmq/rabbit_cert.pem`, `/tmp/certificates/rabbitmq/rabbit_key.pem`.
3. סכמת `QUEUE_URL`: `amqps://` בייצור. `amqp://` ידלג על קריאת ה-PEMs בשקט.
4. לוגי API: `reconnect-scheduled` (broker לא נגיש), `ChannelClosedError` (סגירת channel באמצע publish), `PublishExhaustedError`.
5. exchange `video-editor.commands` ותור `render.requested` קיימים עם הארגומנטים הצפויים. השרת מצהיר עליהם בעת חיבור — `PRECONDITION_FAILED` כאן = drift בטופולוגיה.

**מתן.** שחזר את ה-broker. ה-publisher מתאושש עצמית דרך עטיפת ההתאוששות של amqplib; אין צורך ב-restart של pod API.

## 2. רינדור תקוע — `jobId` נשאר ב-`export.started` לנצח

**סימפטום.** מתממשקים מקבלים `export.started` אבל לעולם לא רואים `completed` או `failed`.

**משמעות.** ה-Worker אולי קרס באמצע רינדור, או שהרינדור באמת ארוך. `export.started` עשוי לפרסם מספר פעמים לאותו `jobId` (redelivery של broker); dedupe לפני שתניח "תקוע".

**בדוק.**

1. pods של Worker פעילים: `kubectl get pods -l service=video-editor-worker`.
2. עומק תור `render.requested` — backlog = workers עסוקים, לא תקועים.
3. צרכני `render.requested` > 0. אם 0, כל רינדור יתקע עד שיחזור Worker.
4. לוגי Worker לפי `jobId` (שדה `businessId`): קריסות ילד FFmpeg, `OOMKilled`, פגיעות ב-`TRANSCODE_TIMEOUT_MS` (ברירת מחדל 2h).
5. אם ה-Worker pod נכבה ב-`SIGKILL` (מגבלת משאבים, eviction, רינדור מעבר ל-`terminationGracePeriodSeconds=600`), ההודעה נמסרת מחדש; כל SIGKILL נספר לעבר `x-delivery-limit=5`. אחרי 5 → DLQ → `export.failed { error: "max retries exceeded" }`.

**מתן.** אם Worker באמת תקוע ולא מתקדם, מחק את ה-pod. K8s יקים תחליף; ההודעה תימסר מחדש. אם הרינדור גדול מדי, העלה `cpu`/`memory` ב-`deploy/worker/deployment.yaml`.

## 3. DLQ מצטבר (`render.dead.messages_ready > 0`)

**סימפטום.** התראה על עומק תור `render.dead`.

**משמעות.** רינדור מיצה `x-delivery-limit=5` ועבר ל-dead-letter. צרכן ה-DLQ של ה-Worker כבר פרסם `export.failed { error: "max retries exceeded" }` סופי למתממשקים — אין סיגנל סופי חסר. אזעקת איכות, לא נכונות.

**בדוק.**

1. לוגי Worker מסוננים לפי ה-`jobId`s ב-DLQ. חמישה כשלים רצופים על אותו job — סיבת הכשל שם.
2. סיבות שורש נפוצות:
   - קריסת FFmpeg על מקור מעוות (`Invalid data`, `moov atom not found`).
   - כשל כתיבה ל-S3 (`Access Denied`, network timeout).
   - OOM של pod במהלך הרינדור.
3. הרבה jobs נפרדים ב-DLQ → בעיה מערכתית (משאבים, S3, רגרסיה). job יחיד שחוזר על עצמו — לא קיים; אם מת, מת. jobIds נפרדים הם הצורה הצפויה.

**מתן.** רוקן את ה-DLQ ברגע שסיבת השורש תוקנה. האירועים הסופיים כבר נמסרו; הודעות ה-DLQ עצמן רישום בלבד.

## 4. segments של preview מחזירים 401 באמצע נגינה

**סימפטום.** משתמש פותח preview, מנגן זמן מה, segments מתחילים להחזיר `401`. או: playlist שמור עובד למשתמש הראשון, נכשל לשני.

**משמעות.** ה-`vod-token` הצרוב ל-URLs של segments ב-HLS playlist פג. TTL ברירת מחדל ~10 דקות; ה-playlist מאוחסן ב-S3 ושורד מעבר ל-token. השהיה מעבר ל-TTL → segments נכשלים. ה-footgun הזה משוקף ב-[apps/mock-vod](../dev/apps/dev-harness).

**בדוק.**

1. `401` מ-VOD בלוגי proxy של `/editor/segment`.
2. גיל ה-playlist (`LastModified` ב-S3) מול TTL של ה-token.

**מתן.** ייצר מחדש את ה-playlist על ידי `POST /editor/preview-source` (ה-FE עושה זאת אוטומטית כשהמשתמש פותר preview מחדש). לטווח ארוך: העלה TTL של VOD token במעלה הזרם אם דפוסי התעבורה כוללים idle ארוך.

## 5. אזהרות `unrouted` בלוגי publisher

**סימפטום.** רשומות שמראות שה-broker החזיר הודעה כ-unroutable.

**משמעות.** ה-publisher משתמש ב-`mandatory: true`. החזרה unrouted = broker קיבל את ההודעה אבל לא מצא תור קשור ל-routing key. השרת מתייחס לזה ככשל פרסום (נרשם + נמדד).

**בדוק.**

1. איזה routing key? `export.*` (אירועים) או `render.requested` (פקודה)?
2. **אירועים:** תור של צוות צרכן חסר או לא קשור ל-`video-editor`. הבעלים בצד הצרכן.
3. **`render.requested`:** ה-Worker לא הצהיר טופולוגיה. בדוק לוגי אתחול של Worker — `assertExchange`/`assertQueue` חייבים להצליח. `PRECONDITION_FAILED` של broker = התור קיים עם ארגומנטים שלא תואמים (לעתים drift של `x-delivery-limit` או `x-message-ttl`).

**מתן.** שחזר את ה-binding (בצד הצרכן) או צור מחדש את התור עם הארגומנטים הצפויים (בצד פקודות — תאם עם בעל הפריסה). ה-publisher ינסה שוב בניסיון הבא.

## 6. חיבור broker בלולאה (`reconnect-scheduled` ספאם)

**סימפטום.** לוגים מתמלאים ב-`reconnect-scheduled`. רטה-limited — ניסיון 1 + כל 10 — ספאם מתמשך = תקלה ממושכת.

**משמעות.** broker לא נגיש. עטיפת ההתאוששות של amqplib עושה את העבודה (`factor: 2`, `maxDelay: 30s`, `jitter: 0.2`, `maxRetries: Infinity`).

**בדוק.**

1. בריאות broker pod, מדיניות רשת, תפוגת תעודת mTLS.
2. `AMQP_INITIAL_CONNECT_TIMEOUT_MS` (ברירת מחדל 15s) מה שגורם לשרת להיכשל מהר באתחול. אחרי אתחול זה שטח לולאת ההתאוששות.
3. `EVENT_PUBLISH_CONFIRM_TIMEOUT_MS` (ברירת מחדל 30s) ו-`COMMAND_PUBLISH_CONFIRM_TIMEOUT_MS` (ברירת מחדל 10s) קובעים כמה זמן publish בטיסה ממתין בחלון ההתחברות מחדש לפני שייכשל.

**מתן.** שחזר את ה-broker. publisher ו-consumer מתרפאים עצמית; אין צורך ב-restart. רקע: [ADR 0006](../dev/adr-index).

## 7. כשל `S3_AUTO_CREATE_BUCKET` באתחול API

**סימפטום.** API pod ב-CrashLoopBackOff מיד אחרי deploy. לוגים מראים כשל יצירת bucket.

**משמעות.** ה-`S3_ACCESS_KEY_ID` חסר `s3:CreateBucket` (או המקבילה ב-MinIO), ו-`S3_AUTO_CREATE_BUCKET=true` (ברירת מחדל). השרת מסרב להתחיל בלי bucket שמיש.

**מתן.** שתי אפשרויות:

1. צור bucket מראש והגדר `S3_AUTO_CREATE_BUCKET=false`. **מומלץ בייצור** — מחזור חיים של bucket אינו דאגה של זמן ריצה.
2. תן הרשאת יצירת bucket לאישורי S3 של ה-API.

## 8. כיבוי Worker לוקח זמן רב

**סימפטום.** rolling deploy תקוע על סיום Worker pod. ה-pod נשאר ב-`Terminating` כמה דקות.

**משמעות.** **התנהגות צפויה.** `terminationGracePeriodSeconds: 600` מאפשר לרינדור בטיסה לסיים לפני SIGKILL. רצף הכיבוי: בטל consumer → המתן עד 540s לבטיסה → drain publisher (5s) → סגור publisher → עצור probe. לא דליפה.

**בדוק.** רק אם הכיבוי עולה על 600s. אז SIGKILL נורה לפני סיום publisher; אישורי broker בטיסה אולי אבדו. ההודעה תימסר מחדש ל-worker אח — עלות ספירת מסירה, לא נכונות.

## 9. חוסר התאמה בפורט probe של Worker

**סימפטום.** Worker pod נכשל מיד ב-readiness/liveness אחרי deploy. K8s מדווח שה-probe לא נגיש.

**משמעות.** ה-`deploy/worker/configmap.yaml` ה-committed מגדיר `WORKER_PROBE_PORT: "8080"` בעוד `deployment.yaml` חושף `containerPort: 8081`. אם הסביבה שלך לא תיאמה — probe מכוון לפורט אחד, התהליך מאזין לאחר.

**מתן.** בחר ערך אחד, הגדר בעקביות בשני הקבצים (וב-`service.yaml` אם proxy), פרוס מחדש. הקוד עצמו ברירת מחדל `8081`.
