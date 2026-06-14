# תפעול

פריסה והפעלה של עורך הווידאו בייצור (רשת סגורה/מבודדת).

## דפים

- [פריסה](deployment) — בניית image, טופולוגיה של שני תהליכים (API + Worker), תשתיות נדרשות, סודות ותעודות, מניפסטים של K8s.
- [ניטור](monitoring) — מעקב/מטריקות של OpenTelemetry, profiling של Pyroscope, לוגים של Pino, probes, מטריקות אזעקה מרכזיות.
- [Runbooks](runbooks) — תבניות אירוע נפוצות שמופקות מנתיבי השגיאה של המערכת. תבניות גנריות להתאמה; לא תיעוד של אירועים קודמים.

## במבט מהיר

- image אחד, שני entrypoints: API (`src/index.ts`, פורט 4001) ו־Worker (`src/worker.ts`, probe 8081). אותה schema של env, `command`/`args` שונים ב־K8s.
- תשתיות נדרשות: RabbitMQ (mTLS בייצור), אחסון אובייקטים תואם S3 (MinIO/AWS S3/וכו'), שירותי Core + VOD במעלה הזרם.
- סודות נדרשים: אישורי S3, AMQP URL, שלושה קבצי PEM עבור mTLS, סוד HMAC לחתימה עבור segment proxy.
- כיבוי מבוקר של Worker: `terminationGracePeriodSeconds: 600` — מותאם למשך הרינדור, לא טעות הקלדה.
