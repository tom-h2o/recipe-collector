# Future Improvements

Captured during development. Items marked ✅ have been implemented.

---

## Already Implemented (since original list)

- ✅ **pgvector similarity search** — `suggest.ts` uses `gemini-embedding-2` embeddings and cosine similarity via the `match_recipes` pgvector function, with a string-matching fallback
- ✅ **Server-side search and pagination** — full-text search via `tsvector` column and `textSearch()`; tag/sort/filter all run at the DB level
- ✅ **PWA / service worker** — `vite-plugin-pwa` with Workbox precaching installed
- ✅ **Per-user settings** — settings table is per-user; model and temperature unit are individual. Per-user *prompts* were removed: they silently pinned each user to whatever prompt text was current when they last saved, so prompt fixes never reached them. Prompts now live only in `api/_lib/prompts.ts`
- ✅ **Rate limiting** — 100 AI calls/day per user, enforced server-side, visible in Settings → Usage Logs
- ✅ **Admin dashboard** — user list, global stats, AI call breakdown by endpoint, recent recipes
- ✅ **Usage meter** — progress bar + per-endpoint breakdown shown to each user in Settings
- ✅ **Recipe sharing** — send/accept/reject with full translation copy
- ✅ **Recipe collections** — users can organise recipes into named collections
- ✅ **Auth required on all AI endpoints** — every `api/*.ts` endpoint that calls Gemini now returns 401 if `getUserId()` is null, instead of silently skipping the rate-limit check for unauthenticated requests
- ✅ **Admin panel server-side pagination** — `GET /api/account?tab=users|recipes|logs&page=&pageSize=` now queries only the requested page (via `.range()` / GoTrue's `listUsers({ page, perPage })`) instead of always fetching 1000 users / 200 recipes / 100 logs. Per-user recipe/AI-call counts are bounded head-only counts scoped to the users on the current page, not a full-table scan. The Recipes tab changed from a per-user accordion to a flat searchable table (with an optional owner filter, reachable by clicking a user's recipe count in the Users tab) since accordion grouping doesn't compose with server-side pagination.

### Shipped later (PRs #7–#19)

- ✅ **Dark mode** — `tailwind.config.js` wrapped tokens as `oklch(var(--x))` while `index.css` already included the wrapper, so every theme utility compiled to invalid CSS and resolved to transparent. Guarded by `tests/unit/theme.test.ts`, which compiles the real stylesheet
- ✅ **Multi-photo extraction** — a recipe can span up to 8 photos, sent to Gemini in one request and merged; photos are downscaled client-side to stay inside Vercel's 4.5 MB body limit
- ✅ **Recipes extracted in their own language** — the photo and PDF prompts reported the source language but never instructed Gemini to *write* in it, so Polish recipes came back in English
- ✅ **Recipe image gallery** — every uploaded photo is kept, with source badges (uploaded / website / stock), a lightbox, set-as-cover and explicit delete. Previously all but the first photo were discarded after extraction
- ✅ **Admin recipe tools** — view, edit and re-run tagging/nutrition on any user's recipe
- ✅ **Service worker took deploys too late** — `skipWaiting` without `clientsClaim` meant a new build only reached users after an extra page load, which is why fixes appeared not to ship
- ✅ **CI actually gates releases** — E2E ran *after* the production deploy; missing secrets passed silently. Production migrations had never once run from CI
- ✅ **Accessibility** — axe over 7 screens in both themes plus keyboard tests; fixed focus trapping, focus return, unlabelled controls and contrast. `focus-visible:ring-3` had been compiling to nothing, leaving no visible focus ring
- ✅ **Meal planner without a mouse** — slots were fillable only by dragging; the existing picker was hidden above the mobile breakpoint
- ✅ **Query indexes** — the schema had six indexes and none matched how the app queries; the rate-limit check ran before every AI call against an index covering only half its filter
- ✅ **Gemini model list** — cut from nine ids to three tiers with guidance and prices. `gemini-2.5-flash-lite` was offered but retired upstream, returning 404 on every call
- ✅ **`find-image` no longer spends AI budget** — an Unsplash lookup was consuming the Gemini daily allowance
- ✅ **Collections in the vault UI** — `RecipeVault` renders collection filter chips and `RecipeDetail` has add/remove handlers; both halves of the old entry are done

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

### Nutritional goals and daily tracking
Nutrition data is shown per recipe but never aggregated or compared against a target.
The goal: set a personal daily aim — calories and protein above all — and have
everything count against it, with a short assistant to work the numbers out
rather than asking the user to invent them.

**Setup assistant.** Ask sex, age, height, weight, activity level, and goal
(lose / maintain / gain, with a rate). Compute maintenance with Mifflin-St Jeor
× an activity factor, then apply the goal. Protein from body weight, roughly
1.6–2.2 g/kg when building and lower when maintaining. Present the result as
*editable fields* rather than a verdict, store the inputs so it can be re-run
when weight changes, and label it plainly as an estimate, not medical advice.
Default to a sensible rate rather than optimising for fastest loss.

**Three decisions to make before building** (discussed, not yet settled):

1. *Planned or eaten?* The meal planner is a plan. Counting it directly needs no
   extra input, but then tomorrow's dinner counts today and skipped meals still
   count. The alternative is a tick-when-eaten action — one tap, and honest.
2. *Portions.* `meal_plan` records that a recipe was planned, not how much of it.
   Nutrition is stored **per serving**, so eating two portions of a four-serving
   stew is off by 2×. Needs a `servings` column on `meal_plan`, default 1,
   whichever way decision 1 goes.
3. *Food that isn't a recipe.* A banana, a coffee, a restaurant lunch. If only
   recipes count the total is systematically low, which makes the number
   untrustworthy. Either accept it means "recipe calories only", or add quick
   manual entries (name + calories + protein).

**Coverage caveat.** At the time of writing, 9 of 29 recipes had no nutrition and
5 had no `servings`. A tracker that silently skips a third of the food is worse
than none, because the number still looks authoritative. Whatever is built should
surface "2 of 4 meals have no nutrition data" and offer to generate it — the
`/api/nutrition` endpoint already does the work.

**Rough shape.** Targets and profile on the per-user `settings` row; a `servings`
column on `meal_plan`; an `intake_log` table only if ticking-off or manual
entries are wanted. Display as per-day totals on the planner plus a prominent
"today" summary of calories and protein against target. Carbs, fat and fibre are
already stored, so showing them costs little — but targets for five numbers make
for a busier UI than targets for two.

### Recipe version history
When a recipe is edited, the previous version is permanently overwritten with no way to undo.
- Store snapshots in a `recipe_versions` table on every update
- Add a "History" option in `RecipeDetail` to browse and restore previous versions

### Batch import queue
Currently importing multiple recipes requires opening each one individually. A queue-based approach would let users paste several URLs at once and have them processed in the background.

---

## Bigger Changes

### Model usage breakdown still scans all `gemini_logs` rows
`getStats()` in `api/account.ts` (Overview tab's "Model usage" chart) still does `select('model')` over the entire `gemini_logs` table to build the per-model counts — the one query the admin pagination pass didn't bound, since PostgREST can't do `GROUP BY` aggregation without a DB-side RPC/view. Fixing it properly needs a migration (e.g. a `gemini_logs_by_model` view or an RPC function); low priority until `gemini_logs` gets large enough for this single-column fetch to matter.

### Offline recipe browsing — partly done
Read-only browsing already survives a bad connection: a `NetworkFirst` runtime
cache covers Supabase REST GETs, and a `CacheFirst` cache covers recipe images
under `/storage/v1/object/public` (200 entries, 30 days) so cook mode keeps its
pictures. What remains is *writing* offline.
- Use Workbox's `BackgroundSync` plugin to queue edits made offline
- Requires a conflict resolution strategy for concurrent edits

### Gallery photo ordering
`recipe_images.sort_order` is upload order and there is no way to change it. With
two or three photos this does not matter; with eight pages of a scanned recipe it
might. Deliberately deferred until the need is real.

### `gemini_logs` cleanup is sampled, not scheduled
The 30-day purge used to run on every insert; it now runs on roughly one insert
in a hundred. That is fine at any real volume but is still a trigger doing
housekeeping. If `pg_cron` is ever enabled, move it to a nightly job and drop the
trigger entirely.

### Cook mode voice control
Hands-free step navigation via the Web Speech API (`SpeechRecognition`) — say "next" or "back" to navigate steps without touching the screen.

### Recipe PDF export
The `/recipe/:id` public share route is print-optimised via Tailwind `print:` utilities. A one-click "Export as PDF" button (using `window.print()` or a headless puppeteer function) would be a natural addition.

---

## Known Dead Code

- `recipeToIngredientText()` in `src/lib/recipeUtils.ts` — still no app callers; kept because it has a test in `recipeUtils.test.ts`
- ~~`useLanguagePreference`~~ — the file no longer exists; entry kept only to note it was already removed
