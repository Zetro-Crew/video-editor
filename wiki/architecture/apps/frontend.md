# Frontend — `@video-editor/frontend`

Vite + React 19 SPA. ממשק המשתמש המלא של עריכת וידאו מבוסס דפדפן. רץ על פורט **3000**.

## פקודות

```bash
pnpm dev          # Vite dev server (port 3000)
pnpm build        # tsc + vite build
pnpm lint         # Biome check + write
pnpm format       # Biome format
pnpm type-check   # tsc --noEmit
pnpm test:e2e     # Playwright E2E tests
pnpm test:e2e:ui  # Playwright interactive UI
```

## Routes

| נתיב | קומפוננטה | תיאור |
|---|---|---|
| `/` | `Home.tsx` | נחיתה / רשימת פרויקטים |
| `/edit` | `EditPage.tsx` | פרויקט חדש |
| `/edit/:id` | `EditPage.tsx` | פתח פרויקט קיים |
| `/editor/embed` | `EditPage.tsx` | יעד הטמעת iframe |

## תכונת Editor (`src/features/editor/`)

משטח העריכה המרכזי. קומפוננטת השורש היא `editor.tsx`.

| תיקייה | מטרה |
|---|---|
| `scene/` | Canvas — Moveable + Selecto drag-select |
| `timeline/` | ציר זמן סקרבר (`@designcombo/timeline`) |
| `player/` | Remotion `<Player>` + `<Composition>` |
| `menu-item/` | פאנל שמאל — ספריית מדיה, העלאות, צורות, טקסט |
| `control-item/` | פאנל ימין — בקרי מאפיינים לכל סוג |
| `store/` | Stores של Zustand |
| `hooks/` | hooks ייעודיים לעורך |
| `external-preview/` | טיפול ב־postMessage של iframe |
| `crop-modal/` | Modal עריכת חיתוך |

### State (Zustand Stores)

| Store | מטרה |
|---|---|
| `use-composition-store.ts` | state של גודל canvas + FPS |
| `use-upload-store.ts` | state של העלאה |
| `use-layout-store.ts` | layout של פאנלים |
| `use-crop-store.ts` | Crop modal |
| `use-download-state.ts` | state של ייצוא (fire-and-forget POST ל־/render, ללא polling) |
| `use-editor-refs.ts` | DOM/player refs (playerRef וכו') |
| `use-selection-store.ts` | state של פריט נבחר |
| `use-timeline-view-store.ts` | state של תצוגה/גלילה של ציר זמן |

Store סצנה גלובלי: `src/store/use-scene-store.ts`

## הטמעת iframe

הטען את העורך ב־`/editor/embed` בתוך iframe. ה־hook `useEditorPostMessage` מטפל בגשר ה־postMessage.

**הודעות נכנסות** (מפורסרות דרך `@video-editor/contract/iframe/from-parent`):
- `EDITOR_ADD_PREVIEW_ITEM` — צרף track. ה־`kind` של ה־payload הוא אחד מ־`recording-range`, `media`, `audio-range`.
- `EDITOR_CLEAR_PROJECT` — אפס את כל ה־tracks ואת המשך.

**הודעות יוצאות** (נבנות דרך `@video-editor/contract/iframe/to-parent`):
- `EDITOR_READY` — נורית פעם אחת באתחול
- `EDITOR_PREVIEW_ITEM_ADDED` — ack ל־`EDITOR_ADD_PREVIEW_ITEM`
- `EDITOR_PREVIEW_ITEM_REJECTED` — nack עם סיבה
- `EDITOR_PROJECT_CLEARED` — ack ל־`EDITOR_CLEAR_PROJECT`
- `EDITOR_MEDIA_SAVED` — נפלט כשרינדור מיוצא נשמר

**הזדהות:** אין token שנשלח דרך postMessage. העורך והשרת שלו חולקים origin (gateway של ייצור; Vite proxy של פיתוח), כך שהדפדפן מצרף אוטומטית את עוגיית `HttpOnly` בשם `ztube-token` ב־`fetch('/editor/preview-source', …)`. השרת קורא אותה מ־header של `Cookie` ומעביר אותה במעלה הזרם ל־Core.

**הגדר origins מותרים:**

```bash
# apps/frontend/.env (optional)
VITE_EDITOR_PARENT_ORIGINS=https://your-app.example.com
```

ברירת מחדל היא `window.location.origin` כשלא מוגדר.

## עיצוב

Tailwind v4 + shadcn/ui (סגנון new-york). משתני CSS ב־`src/globals.css`. מצב כהה דרך `next-themes`.

## תלויות מרכזיות

| חבילה | מטרה |
|---|---|
| `@remotion/*` v4 | הרכבת וידאו ו־player |
| `@designcombo/*` | ציר זמן, אנימציות, frames, state |
| `zustand` v5 | client state |
| `@tanstack/react-query` v5 | server state / data fetching |
| `react-router-dom` v7 | Routing |
| `@radix-ui/*` | UI primitives ללא ראש |
| `@video-editor/contract` | סכמות Zod של postMessage + אירועים (workspace; השתמש ב־subpaths `/iframe/*`) |
