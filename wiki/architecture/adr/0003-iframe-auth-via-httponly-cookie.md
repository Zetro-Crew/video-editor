# ADR 0003 — אימות iframe דרך עוגיית HttpOnly המצורפת על ידי הדפדפן

## סטטוס

התקבל — 2026-06-01.

## קונטקסט

העורך מוטמע כ־iframe בתוך אפליקציית ה־host של ההורה (Angular). אימות משתמש בסביבת ה־host מיוצג על ידי `ztube-token`, עוגיית **HttpOnly** שמוגדרת על ידי זרימת ההזדהות של ה־host על ה־registrable domain המשותף ל־host ועורך.

שרת העורך מבצע קריאות במעלה הזרם ל־Core (`/private/channels/:id/play`) שדורשות את העוגייה הזו. אז ה־token חייב להגיע לשרת העורך בכל בקשת preview.

מימוש קודם: ההורה ב־Angular ניסה `document.cookie.match(/ztube-token=…/)` והעביר את הערך ל־iframe דרך `EDITOR_SET_AUTH`. ה־iframe אחסן אותו ב־ref ושלח אותו בכל בקשה כ־`x-ztube-token`. השרת קרא את ה־header והעביר כ־`Cookie: ztube-token=…` ל־Core.

זה היה שבור בייצור מהגדרה: עוגיות HttpOnly לא נראות ל־`document.cookie`. ההורה תמיד קרא מחרוזת ריקה והשרת תמיד קיבל token ריק. זה עבד רק בפיתוח עם עוגייה לא־HttpOnly.

## החלטה

השלך את כל הטיפול ב־JavaScript ב־token. העורך והשרת שלו מוגשים מאותו registrable domain (ייצור: gateway מנתב את שניהם; פיתוח: vite proxy את `/editor/*` מ־`localhost:3000` ל־`localhost:4001`). `fetch` same-origin מתוך ה־iframe נושא את עוגיית ה־HttpOnly אוטומטית. השרת קורא את `ztube-token` מתוך header ה־`Cookie` הנכנס ו־`HttpPreviewSourceAdapter` מעביר אותו כ־`Cookie: ztube-token=…` בקריאת Core היוצאת.

באופן קונקרטי:

- הודעת `EDITOR_SET_AUTH`, ה־`authTokenRef` ב־`useEditorPostMessage`, פרמטר `authToken` ב־`resolvePreviewSource` / `addPreviewItemToEditor`, header הבקשה `x-ztube-token` — כולם נמחקו.
- הורה ה־Angular כבר לא קורא או פולט את העוגייה.
- controller השרת קורא את `request.headers.cookie` ומפרסר `ztube-token` inline (לא נוספה תלות `@fastify/cookie`).

## חלופות שנשקלו

1. **שמור על `EDITOR_SET_AUTH` אבל הפוך את העוגייה ללא־HttpOnly.** נדחה — מחליש את עמדת ה־XSS ללא יתרון תפעולי, כי פריסת same-domain הופכת את הצירוף של הדפדפן לטריוויאלי.
2. **החלפת token שרת-לשרת (OAuth, signed introspection).** נדחה — מוסיף תלות במעלה הזרם ו־credential store חדש לבעיה שהדפדפן כבר פותר תחת אירוח same-domain.
3. **plugin `@fastify/cookie` ל־parsing.** נדחה — regex אחד על `request.headers.cookie` מספיק; הוספת תלות סותרת את עמדת "צמצום משטח חיצוני" של רשת סגורה.

## השלכות

- שרת העורך **חייב** להיות מוגש על אותו registrable domain כמו host ההורה. הטמעה cross-domain מחוץ לטווח תחת התכנון הזה והייתה דורשת סכמת הזדהות חדשה (למשל token bearer קצר-מועד שמוטבע על ידי ה־host ונשלח דרך ערוץ origin מאושר).
- פיתוח מקומי דורש את ה־vite proxy: כל fetch שלא proxy (למשל ישירות ל־`http://localhost:4001`) הוא cross-origin ולא יישא עוגיות `localhost` אלא אם `credentials: 'include'` מוגדר במפורש עם CORS credentials מוגדר בצד השרת. ההגדרה הנוכחית משתמשת ב־`credentials: 'same-origin'` (ברירת המחדל של `fetch`), שמספיקה דרך ה־proxy.
- משטח חוזה ה־iframe מתכווץ (סוג הודעה אחד פחות, סכמה אחת פחות).
- סבב, ביטול ואחסון של token הופכים לדאגה של ה־host בלבד. העורך לעולם לא נוגע בערך.
