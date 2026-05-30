# Future Improvements

Captured during development. Items marked ✅ have been implemented.

---

## Already Implemented (since original list)

- ✅ **pgvector similarity search** — `suggest.ts` uses `gemini-embedding-2` embeddings and cosine similarity via the `match_recipes` pgvector function, with a string-matching fallback
- ✅ **Server-side search and pagination** — full-text search via `tsvector` column and `textSearch()`; tag/sort/filter all run at the DB level
- ✅ **PWA / service worker** — `vite-plugin-pwa` with Workbox precaching installed
- ✅ **Per-user settings** — settings table is per-user; model, prompts, temperature unit are individual
- ✅ **Rate limiting** — 100 AI calls/day per user, enforced server-side, visible in Settings → Usage Logs
- ✅ **Admin dashboard** — user list, global stats, AI call breakdown by endpoint, recent recipes
- ✅ **Usage meter** — progress bar + per-endpoint breakdown shown to each user in Settings
- ✅ **Recipe sharing** — send/accept/reject with full translation copy
- ✅ **Recipe collections** — users can organise recipes into named collections

---

## Quick Wins

- ✅ **Meal planner week navigation** — prev/next week buttons with `weekOffset` state; shows weekly calorie total

### Cook mode timer
Step-by-step cook mode has no timer despite most steps mentioning durations.
- Parse time expressions from step text ("simmer for 10 minutes") and pre-fill a countdown
- Or a simple manual stopwatch in the cook mode header

### Rate limit indicator in the header
Currently only visible after opening Settings → Usage Logs. A lightweight indicator in the navbar (e.g. a small pill showing "82/100 today") would be more discoverable without requiring navigation.

### Plain-text recipe import
Currently recipes come in via URL, photo, or PDF. Add a text area mode where users can paste a recipe as plain text and Gemini structures it — useful for recipes copied from apps, books, or chat.

- ✅ **Embedding backfill** — `backfill_embeddings.js` utility script exists (gitignored)

---

## Medium Effort

### Admin panel pagination
The `GET /api/account` handler fetches up to 1000 users, 200 recipes, and 100 logs in a single request. This will become slow as usage grows. Add cursor-based pagination for the users and recipes tabs, and limit the logs query to the last 24 hours by default.

### Nutritional goals and daily tracking
Nutrition data is shown per recipe but not aggregated or compared against targets.
- Let users set daily targets (calories, protein, carbs, fat) in Settings
- Show a nutrition summary on the meal planner, populated from the planned recipes

### Recipe version history
When a recipe is edited, the previous version is permanently overwritten with no way to undo.
- Store snapshots in a `recipe_versions` table on every update
- Add a "History" option in `RecipeDetail` to browse and restore previous versions

### Batch import queue
Currently importing multiple recipes requires opening each one individually. A queue-based approach would let users paste several URLs at once and have them processed in the background.

### Collections in the vault UI
The `useCollections` hook and DB schema exist but the collections feature has limited surface area in the UI. A dedicated collection filter in `RecipeVault` and a collection picker in `RecipeDetail` would make it more useful.

---

## Bigger Changes

### Rate limiting for unauthenticated requests
The current rate limit only applies to authenticated users (identified by `user_id`). Unauthenticated or anonymous requests to AI endpoints are not rate-limited at all. Add IP-based limiting as a secondary layer.

### Offline recipe browsing
The PWA service worker precaches static assets but not recipe data. IndexedDB caching of the loaded recipe list would allow browsing offline.
- Use Workbox's `BackgroundSync` plugin to queue edits made offline
- Requires conflict resolution strategy for concurrent edits

### Cook mode voice control
Hands-free step navigation via the Web Speech API (`SpeechRecognition`) — say "next" or "back" to navigate steps without touching the screen.

### Recipe PDF export
The `/recipe/:id` public share route is print-optimised via Tailwind `print:` utilities. A one-click "Export as PDF" button (using `window.print()` or a headless puppeteer function) would be a natural addition.

---

## Known Dead Code

- `recipeToIngredientText()` in `src/lib/recipeUtils.ts` — no app callers; kept because it has a test in `recipeUtils.test.ts`
- `useLanguagePreference` in `src/hooks/` — localStorage approach superseded by the `recipes.preferred_language` DB column
