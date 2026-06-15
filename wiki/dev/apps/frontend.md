# frontend

`apps/frontend` · Vite + React 19 SPA · פורט **3000**.

ה-UI של עריכת הווידאו. רץ במצב standalone או מוטמע ב-iframe.

## פקודות

```bash
pnpm dev          # Vite dev server (3000)
pnpm build        # tsc + vite build
pnpm lint         # Biome check + write
pnpm format       # Biome format
pnpm type-check   # tsc --noEmit
pnpm test:e2e     # Playwright E2E
pnpm test:e2e:ui  # Playwright UI
```

## Routes

| נתיב | קומפוננטה | תיאור |
|---|---|---|
| `/` | `Home.tsx` | נחיתה / רשימת פרויקטים |
| `/edit` | `EditPage.tsx` | פרויקט חדש |
| `/edit/:id` | `EditPage.tsx` | פרויקט קיים |
| `/editor/embed` | `EditPage.tsx` | יעד הטמעת iframe |

## תכונת Editor (`src/features/editor/`)

| תיקייה | מטרה |
|---|---|
| `scene/` | Canvas — Moveable + Selecto |
| `timeline/` | ציר זמן (`@designcombo/timeline`) |
| `player/` | Remotion `<Player>` + `<Composition>` |
| `menu-item/` | פאנל שמאל — מדיה, העלאות, צורות, טקסט |
| `control-item/` | פאנל ימין — בקרים לכל סוג פריט |
| `store/` | Zustand stores |
| `hooks/` | hooks ייעודיים לעורך |
| `external-preview/` | טיפול ב-postMessage של iframe |
| `crop-modal/` | modal חיתוך |

## Stores (Zustand)

| Store | מטרה |
|---|---|
| `use-composition-store` | גודל canvas + FPS |
| `use-upload-store` | סטטוס העלאה |
| `use-layout-store` | layout פאנלים |
| `use-crop-store` | מצב crop modal |
| `use-download-state` | מצב ייצוא (fire-and-forget POST ל-`/render`, בלי polling) |
| `use-editor-refs` | DOM/player refs |
| `use-selection-store` | פריט נבחר |
| `use-timeline-view-store` | תצוגה וגלילה של ציר זמן |

Store סצנה גלובלי: `src/store/use-scene-store.ts`.

## הטמעת iframe

הטעינה מתבצעת ב-`/editor/embed`. ה-hook `useEditorPostMessage` מטפל בגשר ה-postMessage.

הודעות נכנסות (`@video-editor/contract/iframe/from-parent`):
- `EDITOR_ADD_PREVIEW_ITEM` — `kind: "recording-range"` או `"audio-range"`.
- `EDITOR_ADD_MEDIA { mediaId }` — מדיה מאוחסנת ב-id בלבד (ADR 0007).
- `EDITOR_CLEAR_PROJECT` — איפוס.

הודעות יוצאות (`@video-editor/contract/iframe/to-parent`):
- `EDITOR_READY` · `EDITOR_PREVIEW_ITEM_ADDED` · `EDITOR_PREVIEW_ITEM_REJECTED` · `EDITOR_PROJECT_CLEARED` · `EDITOR_MEDIA_SAVED`.

הזדהות: עוגיית `ztube-token` (HttpOnly) של ה-host מצורפת אוטומטית ב-fetch של same-origin. אין token דרך postMessage. ראה [ADR 0003](../adr-index).

לפירוט פרוטוקול: [integrate/iframe](../../integrate/iframe).

הגדרת origins מותרים:

```bash
# apps/frontend/.env (אופציונלי)
VITE_EDITOR_PARENT_ORIGINS=https://your-app.example.com
```

ברירת מחדל: `window.location.origin`.

## עיצוב

Tailwind v4 + shadcn/ui (סגנון new-york). משתני CSS ב-`src/globals.css`. מצב כהה דרך `next-themes`.

## תלויות מרכזיות

| חבילה | מטרה |
|---|---|
| `@remotion/*` v4 | הרכבת וידאו ו-player |
| `@designcombo/*` | timeline, animations, frames, state |
| `zustand` v5 | client state |
| `@tanstack/react-query` v5 | server state |
| `react-router-dom` v7 | routing |
| `@radix-ui/*` | UI primitives |
| `@video-editor/contract` | סכמות Zod (subpaths `iframe/*`) |

## מקורות

- `apps/frontend/README.md`
- [apps/frontend/CLAUDE.md](https://github.com/Zetro-Crew/video-editor/blob/main/apps/frontend/CLAUDE.md)
