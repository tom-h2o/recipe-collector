# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server (frontend only; API routes need Vercel CLI to work locally)
npm run build        # tsc -b && vite build (must pass before committing)
npm run lint         # ESLint
npm run test         # Vitest run (single pass)
npm run test:watch   # Vitest watch mode
npm run db:migrate   # supabase db push (applies /supabase/migrations/ to the remote DB)
```

To run a single test file: `npx vitest run src/lib/recipeUtils.test.ts`

## Architecture Overview

**Deployment:** Vercel. The frontend is a Vite/React SPA; the backend is Vercel Serverless Functions in `/api/`. Routing is handled by `vercel.json` — all `/api/*` calls go to the functions, everything else serves `index.html`.

**Database:** Supabase (Postgres + RLS). Schema is in `/supabase/migrations/` (23 migrations as of now). Tables: `recipes`, `meal_plan`, `shopping_list`, `settings`, `url_cache`, `gemini_logs`, `pantry`, `translations`, and storage for recipe photos.

**AI:** Google Gemini (via `@google/genai`). All API endpoints call Gemini and return JSON. The active model and system prompt are stored in the `settings` table, configurable per-user from the UI.

### Frontend (`/src/`)

- `App.tsx` — root component: initialises all hooks, wires up views, handles routing for the `/recipe/:id` public share URL
- `types.ts` — all shared TypeScript interfaces (`Recipe`, `Ingredient`, `Nutrition`, `MealPlan`, `ShoppingItem`, `PantryItem`, `AppSettings`, `RecipeTranslation`)
- `lib/constants.ts` — `MODELS`, `FILTERS`, `AVAILABLE_TAGS`, `MEAL_TYPES`, `LANGUAGES`, `SORT_OPTIONS`, `PAGE_SIZE` (24), `DEFAULT_PROMPT`
- `lib/recipeUtils.ts` — `parseIngredients()` (handles both `Ingredient[]` and legacy `string[]`), `scaleAmount()`, `recipeToIngredientText()`
- `lib/supabase.ts` — singleton Supabase browser client
- `lib/sentry.ts` — Sentry frontend init (no-ops if `VITE_SENTRY_DSN` is unset)

**Hooks** (each owns its own Supabase queries and state):
- `useRecipes` — paginated recipe list (PAGE_SIZE=24), polling for AI processing completion (`processingIds` set), `saveRecipe`/`updateRecipe`/`deleteRecipe`/`toggleFavourite`
- `useMealPlans`, `useShoppingList`, `useSettings` — self-explanatory
- `useAuth` — Supabase Auth: password + magic link (no Google OAuth). Returns `user`, `loading`, `signOut`
- `useLanguagePreference` — persists preferred translation language in `localStorage`
- `useDarkMode` — syncs with `prefers-color-scheme` and persists in `localStorage`

**Components** (one per feature, all in `/src/components/`):
- `AuthGate` — wraps the whole app; shows login UI if unauthenticated; handles "claim existing recipes" for pre-auth data
- `Layout` — header, nav tabs, action buttons
- `RecipeVault` — grid with search, filter chips, sort, infinite scroll ("Load more")
- `RecipeCard` — individual card with processing spinner badge
- `RecipeDetail` — full-screen drawer: scaling, translation, cook mode entry, edit/delete/share
- `RecipeForm` — add/edit dialog; URL extraction and photo upload flows
- `CookMode` — fullscreen step-by-step mode with ingredient side panel
- `MealPlanner` — 7-day calendar
- `ShoppingList` — shopping + pantry tabs
- `SettingsPanel` — Gemini model/prompt/API key config
- `SuggestModal` — ingredient-based AI recipe suggestion
- `GeminiLogs` — admin view of AI call history

### API (`/api/`)

Each handler follows the same pattern: validate with Zod → read settings from DB → call Gemini → return JSON.

**Shared helpers in `/api/_lib/`:**
- `cors.ts` — `setCorsHeaders(res)`, reads `ALLOWED_ORIGIN` env var
- `supabase.ts` — `getServerSupabase()` (service key), `getSettings()`, `resolveApiKey()` (supports two Gemini keys switchable from settings UI)
- `gemini.ts` — `getGeminiClient()`, `generateJson()` (logs every call to `gemini_logs` table, captures errors to Sentry)
- `schemas.ts` — Zod schemas for all request bodies
- `sentry.ts` — server-side Sentry init, `captureException()`
- `cache.ts` — shared URL/AI cache helpers

**Endpoints:**
- `extract.ts` — fetch URL → cheerio scrape → Gemini → JSON recipe (7-day URL cache in `url_cache` table)
- `tag.ts` — generate tags for a recipe
- `nutrition.ts` — generate nutrition data for a recipe
- `suggest.ts` — suggest recipes from available ingredients (queries last 50 recipes, not all)
- `shopping.ts` — generate shopping list from meal plan recipes
- `scale.ts` — AI-assisted recipe scaling
- `translate.ts` — translate recipe to another language (cached in `translations` table)
- `extract-photo.ts` — extract recipe from an uploaded image
- `find-image.ts` — find a suitable image URL for a recipe

## Environment Variables

Copy `.env.example` to `.env.local`. Required:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase project
- `SUPABASE_SERVICE_KEY` — service role key (API functions only, never browser)
- `GEMINI_API_KEY_1` — primary Gemini API key (`GEMINI_API_KEY_2` is optional second key)

Optional: `VITE_SENTRY_DSN`, `SENTRY_DSN`, `VITE_APP_ENV`, `ALLOWED_ORIGIN`

## Key Patterns

- **`ingredients` field is polymorphic:** stored as `Ingredient[]` (objects with `amount`, `name`, `details`) but older recipes may be `string[]`. Always use `parseIngredients()` from `recipeUtils.ts` before rendering or processing ingredients.
- **Processing state:** after saving a recipe, `useRecipes` polls the DB every 2s until `tags.length > 0 && nutrition !== null` (or 30s timeout). The `processingIds` set drives spinner badges on cards.
- **Pagination:** `fetchRecipes()` resets to page 0; `loadMore()` appends. Client-side search/filter operates only on loaded pages.
- **Auth + RLS:** The browser client uses the user session (RLS enforced). API functions use `SUPABASE_SERVICE_KEY` (bypasses RLS). Recipes with `user_id = null` are visible to all authenticated users (legacy data).
- **Gemini logging:** every `generateJson()` call inserts a row into `gemini_logs` with latency, status, input/output previews. Visible in `GeminiLogs` component (admin).
