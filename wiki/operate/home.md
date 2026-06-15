# Operate

הפעלת העורך בייצור — רשת סגורה.

- [פריסה](deployment) — בניית image, טופולוגיה של API + Worker, תשתיות נדרשות, סודות, מניפסטים של K8s.
- [ניטור](monitoring) — OTel traces/metrics, Pyroscope profiles, Pino logs, probes, מטריקות לאזעקה.
- [Runbooks](runbooks) — תבניות אירוע נפוצות שנגזרות מנתיבי השגיאה של הקוד. גנריות — חדד עם נתונים אמיתיים בעת שתצבור.

## במבט מהיר

- image אחד, שני entrypoints: API (`src/index.ts`, פורט 4001) ו-Worker (`src/worker.ts`, probe 8081). אותה schema של env, רק `command`/`args` שונים ב-K8s.
- תשתיות נדרשות: RabbitMQ (mTLS בייצור), אחסון תואם S3 (MinIO / AWS S3 / וכו'), שירותי Core + VOD במעלה הזרם.
- סודות נדרשים: אישורי S3, AMQP URL, שלושה PEMs ל-mTLS, סוד HMAC ל-segment proxy.
- כיבוי Worker: `terminationGracePeriodSeconds: 600` — מותאם למשך הרינדור, לא טעות הקלדה.
