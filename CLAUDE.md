# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server (frontend only; API routes need Vercel CLI to work locally)
npm run build        # tsc -b && vite build (must pass before committing)
npm run lint         # ESLint
npm run test         # Vitest run (single pass)
npm run test:watch   # Vitest watch mode
npm run test:ui      # Vitest with browser UI
npm run test:e2e     # Playwright e2e tests (tests/e2e/); needs the app running
```

npm run db:migrate   # npx supabase db push — applies any new /supabase/migrations/ files to the remote DB

To run a single test file: `npx vitest run src/lib/recipeUtils.test.ts`

## Architecture Overview

**Deployment:** Vercel. The frontend is a Vite/React SPA; the backend is Vercel Serverless Functions in `/api/`. Each endpoint is its own function file — Vercel routes `/api/<name>` to `api/<name>.ts` automatically. The SPA catch-all (`/(.*) → /index.html`) is in `vercel.json`.

**Database:** Supabase (Postgres + RLS). Schema is in `/supabase/migrations/` (38 migrations). Tables: `recipes`, `meal_plan`, `shopping_list`, `settings`, `url_cache`, `ai_cache`, `gemini_logs`, `pantry_items`, `recipe_translations`, `recipe_shares`, `contacts`, `collections`, `recipe_collections`, and storage for recipe photos. `recipes.embedding` is a pgvector column (768-dim `gemini-embedding-2`); `recipes.search_vector` is a `tsvector` for server-side full-text search.

**AI:** Google Gemini (via `@google/genai`). All API endpoints call Gemini and return JSON. The active model, prompts, and temperature unit are stored in the `settings` table, configurable per-user from the UI (prompt defaults live in `api/_lib/prompts.ts`, overridable per user).

### Frontend (`/src/`)

- `App.tsx` — root component: initialises all hooks, wires up views, handles routing for the `/recipe/:id` public share URL
- `types.ts` — all shared TypeScript interfaces (`Recipe`, `Ingredient`, `Nutrition`, `MealPlan`, `ShoppingItem`, `PantryItem`, `AppSettings`, `RecipeTranslation`, `RecipeShare`, `Contact`, `Collection`, `RecipeCollection`)
- `components/ui/` — shadcn/ui primitives (built on `@base-ui/react`); add new primitives here via the shadcn CLI, don't hand-author
- `lib/constants.ts` — `MODELS`, `FILTERS`, `AVAILABLE_TAGS`, `MEAL_TYPES`, `LANGUAGES`, `SORT_OPTIONS`, `PAGE_SIZE` (24), `DEFAULT_PROMPT`
- `lib/recipeUtils.ts` — `parseIngredients()` (defensive: handles both `Ingredient[]` and legacy `string[]`, though the DB now enforces `Ingredient[]` via a check constraint), `scaleAmount()`, `recipeToIngredientText()`
- `lib/temperatureUtils.ts` — parses °C/°F (and written-out "degrees") in recipe text and converts to the user's preferred unit at display time
- `lib/supabase.ts` — singleton Supabase browser client
- `lib/api.ts` — `apiFetch(url, options)`: attaches the Supabase session Bearer token to every API request
- `lib/sentry.ts` — Sentry frontend init (no-ops if `VITE_SENTRY_DSN` is unset)
- `store/recipeStore.ts` — Zustand store holding recipe list state (`recipes`, `processingIds`, pagination, in-flight polling intervals) and the actual `fetchRecipes`/`loadMore`/`saveRecipe`/`updateRecipe`/`deleteRecipe`/`toggleFavourite` implementations; `useRecipes` (below) is a thin hook wrapper around it

**Hooks** (each owns its own Supabase queries and state, except `useRecipes`):
- `useRecipes` — thin wrapper around `store/recipeStore.ts` (Zustand); exposes paginated recipe list (PAGE_SIZE=24), polling for AI processing completion (`processingIds` set), `saveRecipe`/`updateRecipe`/`deleteRecipe`/`toggleFavourite`
- `useMealPlans`, `useShoppingList`, `useSettings` — self-explanatory
- `useAuth` — Supabase Auth: password + magic link. Returns `user`, `loading`, `isPasswordRecovery`, `sendPasswordReset`, `updatePassword`, `resendConfirmation`, `signOut`
- `useRecipeShares` — inbox (pending shares), contacts for autocomplete, `sendShare`/`acceptShare`/`rejectShare`
- `useCollections` — manages `collections` and `recipe_collections` tables; CRUD for user-created recipe collections; takes `userId` param
- `useTranslationCache` — pre-fetches translations for every recipe that has a `preferred_language` set; uses a `fetchedIds` ref to prevent re-querying on unrelated recipe list updates (e.g., toggling a favourite)
- `useDarkMode` — syncs with `prefers-color-scheme` and persists in `localStorage`
- `useUsage` — fetches today's Gemini call count for the logged-in user from `gemini_logs`; used by `SettingsPanel` to show the daily usage meter

**Components** (one per feature, all in `/src/components/`):
- `ErrorBoundary` — standard React error boundary; wraps top-level app subtrees
- `PublicRecipe` — printable standalone recipe view rendered at the `/recipe/:id` public share URL (no auth required); print-optimised via Tailwind `print:` utilities
- `AuthGate` — wraps the whole app; shows login UI if unauthenticated; handles "claim existing recipes" for pre-auth data. Includes password, magic link, forgot password, and set-new-password (recovery) flows. All errors shown inline (never toast-only).
- `Layout` — header, nav tabs (Vault / Meal Planner / Shopping / Inbox), action buttons. Inbox tab shows orange badge when pending shares exist. Suggest button always rendered (removing it conditionally caused navbar height jitter).
- `RecipeVault` — grid with search, filter chips, sort, infinite scroll ("Load more")
- `RecipeCard` — individual card with processing spinner badge; shows translated title/description if `recipeLanguages[recipe.id]` is set
- `RecipeDetail` — full-screen drawer: scaling, translation, cook mode entry, edit/delete/share/send
- `RecipeForm` — add/edit dialog; URL extraction and photo upload flows
- `CookMode` — fullscreen step-by-step mode with ingredient side panel
- `MealPlanner` — 7-day calendar
- `ShoppingList` — shopping + pantry tabs
- `SettingsPanel` — Gemini model/prompt config; Usage Logs tab shows daily usage meter (progress bar + per-endpoint breakdown) and recent AI call history
- `SuggestModal` — ingredient-based AI recipe suggestion
- `SendRecipeModal` — send a recipe to another user by email; autocompletes from known contacts
- `RecipeInbox` — displays pending received recipes with Accept / Decline actions
- `UserMenu` — profile dropdown: signed-in provider, change password, sign out
- `GeminiLogs` — recent AI call history (endpoint, model, status, latency, expandable input/output)
- `AdminPanel` — admin-only dashboard: global stats, and server-side-paginated Users/Recipes/AI Logs tabs (25 rows/page, fetched from `GET /api/account?tab=...`)

### API (`/api/`)

Each handler is a standard Vercel serverless function: `export default async function handler(req: VercelRequest, res: VercelResponse)`. All handlers follow the same pattern: `setCorsHeaders` → OPTIONS guard → method guard → Zod validation → cache check → rate limit check → read settings → call Gemini → return JSON.

**Shared helpers in `/api/_lib/`:**
- `cors.ts` — `setCorsHeaders(res)`, reads `ALLOWED_ORIGIN` env var
- `supabase.ts` — `getServerSupabase()` (service key), `getSettings(supabase, userId?)` (reads per-user row, falls back to global `id=1` row), `resolveApiKey()`, `getUserId(authHeader: string | undefined)` — takes the raw Authorization header string, not a VercelRequest
- `gemini.ts` — `getGeminiClient()`, `generateJson()` (logs every call to `gemini_logs` table, captures errors to Sentry)
- `prompts.ts` — default prompt templates (one export per endpoint); `getSettings()` returns the user's override if they've saved one in Settings, else these defaults
- `schemas.ts` — Zod schemas for all request bodies
- `sentry.ts` — server-side Sentry init, `captureException()`
- `cache.ts` — helpers for both the `url_cache` table (extract endpoint, 7-day TTL) and the `ai_cache` table (other AI results)
- `rateLimit.ts` — `checkRateLimit(supabase, userId)` counts today's `gemini_logs` rows; `DAILY_LIMIT = 100` exported (imported by `useUsage.ts` — single source of truth); returns 429 when exceeded

**Endpoints (all at `api/<name>.ts`, 10 total):**
- `extract.ts` — fetch URL → cheerio scrape → Gemini → JSON recipe (7-day URL cache); also handles photo (`imageBase64`) and PDF (`pdfBase64`) extraction
- `tag.ts` — generate tags + a 768-dim `gemini-embedding-2` text embedding for a recipe, stored in `recipes.embedding`
- `nutrition.ts` — generate nutrition data for a recipe
- `suggest.ts` — suggest recipes from available ingredients; embeds the ingredient list and calls the `match_recipes` pgvector RPC (cosine similarity, threshold 0.1) first, falls back to in-memory string scoring if no vector matches
- `shopping.ts` — generate shopping list from meal plan recipes
- `scale.ts` — AI-assisted recipe scaling
- `translate.ts` — translate recipe to another language (cached in `recipe_translations` table)
- `find-image.ts` — find a suitable image URL via Unsplash
- `share.ts` — recipe sharing: `send` / `accept` / `reject` actions
- `account.ts` — GET: admin dashboard, paginated per tab (`?tab=overview|users|recipes|logs&page=&pageSize=`, max page size 100); DELETE: delete own or (admin) any user account

## Environment Variables

Copy `.env.example` to `.env.local`. Required:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase project
- `SUPABASE_SERVICE_KEY` — service role key (API functions only, never browser)
- `GEMINI_API_KEY_1` — primary Gemini API key (`GEMINI_API_KEY_2` is optional second key)

Optional: `VITE_SENTRY_DSN`, `SENTRY_DSN`, `VITE_APP_ENV`, `ALLOWED_ORIGIN`, `VITE_ADMIN_EMAIL` (email address granted admin panel access), `UNSPLASH_ACCESS_KEY`

GitHub Actions secret needed for DB migrations: `SUPABASE_DB_URL` (Postgres connection string from Supabase dashboard → Project Settings → Database → URI).

## Key Patterns

- **`ingredients` field:** stored as `Ingredient[]` (objects with `amount`, `name`, `details`); a DB check constraint (`chk_ingredients_format`, migration 0036) enforces this on all rows and legacy `string[]` data was migrated. Frontend code still uses `parseIngredients()` from `recipeUtils.ts` defensively before rendering or processing ingredients.
- **Processing state:** after saving a recipe, `recipeStore` polls the DB every 2s until `tags.length > 0 && nutrition !== null` (or 30s timeout). The `processingIds` set drives spinner badges on cards.
- **Pagination & search:** `fetchRecipes()` resets to page 0; `loadMore()` appends. Search runs server-side via Postgres full-text search (`recipes.search_vector` tsvector column, queried with `.textSearch()`); tag/sort/filter also run at the DB level, not client-side.
- **Auth + RLS:** The browser client uses the user session (RLS enforced). API functions use `SUPABASE_SERVICE_KEY` (bypasses RLS). Recipes with `user_id = null` are visible to all authenticated users (legacy data).
- **Per-recipe language:** `recipes.preferred_language` stores the last-used display language per recipe. Written via `updateRecipe()` when the user switches language in RecipeDetail.
- **Per-user settings:** the `settings` table has one row per user, keyed by `user_id`. The `id` column uses a sequence starting at 2; the global fallback row is `id=1, user_id=null`. `getSettings(supabase, userId)` reads the user's row first, falls back to `id=1`. Frontend upserts on `user_id` conflict.
- **Auth required on AI endpoints:** every AI endpoint returns 401 if `getUserId()` resolves to `null` (no/invalid Bearer token) before doing any work — there is no legitimate unauthenticated caller since the frontend is fully auth-gated. Rate limiting then calls `checkRateLimit(supabase, userId)` AFTER the cache check (cached responses bypass the limit). Returns 429 at 100 calls/day. Count derived from `gemini_logs` rows for the current UTC day.
- **Recipe sharing RLS:** `recipe_shares` uses `auth.email() = recipient_email` so recipients can see their inbox. Service key copies the recipe server-side on accept.
- **Password recovery flow:** `useAuth` intentionally does not clear `isPasswordRecovery` on `SIGNED_IN` — only on `USER_UPDATED`/`SIGNED_OUT`/etc. — so `AuthGate` can show the set-password form.
- **Gemini logging:** every `generateJson()` call inserts a row into `gemini_logs`. Visible in `GeminiLogs` component and admin dashboard.
- **Admin dashboard pagination:** `api/account.ts` never fetches an unbounded table. Users/Recipes/Logs tabs each query only their requested page; per-user `recipe_count`/`ai_call_count` on the Users tab are `head: true` counts scoped to just that page's user ids (not a full-table scan). Emails for Recipes/Logs rows are resolved per-row via `auth.admin.getUserById()`, bounded by page size. The one remaining unbounded query is `getStats()`'s model-usage breakdown, which still does `select('model')` over all of `gemini_logs` (no DB-side `GROUP BY` without an RPC — see `future_improvements.md`).
- **Known dead code:** `recipeToIngredientText()` in `recipeUtils.ts` (no app callers, kept for its test).
- **Vercel function limit:** Hobby plan allows 12 serverless functions. Currently 10 are in use. Do not add new `api/*.ts` files beyond 12 without upgrading the plan or merging endpoints.
- **PWA:** `vite-plugin-pwa` + Workbox precaching is configured in `vite.config.ts`.
