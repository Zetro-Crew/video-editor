# iframe Demo — Harness אינטגרציית Angular

אפליקציית Angular 21 standalone לבדיקת אינטגרציית ההטמעה של iframe של עורך הווידאו. רצה על פורט **8080**.

> [!NOTE]
> זהו harness פיתוח, לא אפליקציית ייצור. השתמש בו כדי לבדוק תקשורת postMessage בין דף host לעורך המוטמע.

## פקודות

```bash
pnpm dev          # Angular dev server (port 8080)
pnpm build        # ng build
pnpm lint         # Biome check
pnpm format       # Biome format
pnpm type-check   # tsc --noEmit
```

## הגדרה

העורך חייב לרוץ ב־`http://localhost:3000` לפני הפעלת אפליקציה זו:

```bash
# From repo root
pnpm dev
```

או הרץ רק את האפליקציות הנדרשות:

```bash
cd apps/frontend && pnpm dev   # port 3000
cd apps/iframe-demo && pnpm dev  # port 8080
```

## מה זה עושה

דף ה־demo (`/`) טוען את העורך ב־iframe צף, נגרר ובר־שינוי גודל שמכוון ל־`http://localhost:3000/editor/embed`. לוח שליטה מאפשר:

- **הוספת preview item** — שולח `EDITOR_ADD_PREVIEW_ITEM` (recording-range) לעורך
- **ניקוי הפרויקט** — שולח `EDITOR_CLEAR_PROJECT` לאיפוס כל ה־tracks
- **בדיקת הודעות** — מציג את ה־payload היוצא ואת התגובה האחרונה מהעורך

## קבצים מרכזיים

| קובץ | מטרה |
|---|---|
| `src/app/pages/editor-page/editor-page.component.ts` | דף ראשי — host של iframe, drag/resize, postMessage |
| `src/app/pages/media-page/media-page.component.ts` | דף מדיה משני |
| `src/app/services/editor-bridge.service.ts` | תור מבוסס Signal להזרקת פריטים בין דפים |
| `src/app/message-types.ts` | מראה טיפוס מקומי של `@video-editor/contract/iframe/from-parent` + `/iframe/to-parent` |
| `src/environments/environment.ts` | הגדרת `editorUrl` |

## הגדרות

כדי להפנות את ה־iframe ל־URL שונה של עורך, ערוך את `src/environments/environment.ts`:

```ts
export const environment = {
  editorUrl: 'http://localhost:3000/editor/embed',
};
```

## פרוטוקול postMessage

ראה [contract](./contract) ל־schema המלא של ההודעות. אפליקציית ה־demo משתמשת במראה טיפוס מקומי (`message-types.ts`) במקום לייבא את חבילת ה־workspace ישירות.

**הזדהות:** עוגיית `ztube-token` היא HttpOnly ולעולם לא נוסעת דרך postMessage. fetches של same-origin של ה־iframe של העורך לשרת שלו מצרפים אותה אוטומטית.

## תלויות

| חבילה | מטרה |
|---|---|
| `@angular/core` v21 | Framework |
| `@angular/router` | Routing |
| `rxjs` v7 | דפוסים reactive |
