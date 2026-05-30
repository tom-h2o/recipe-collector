# Architecture

This document describes the system architecture, data models, and design patterns of **Speisekammer** (Recipe Vault). It reflects the current implemented state.

---

## System Overview

Speisekammer is a serverless web application: a React SPA frontend, independent Vercel Serverless Functions for the API, a hosted PostgreSQL database with row-level security, and Google Gemini for AI.

```
Browser
  │
  ├─── Supabase JS client (auth + direct DB queries via RLS)
  │
  └─── apiFetch() → Vercel Serverless Functions (/api/*.ts)
            │
            ├── Supabase service key (bypasses RLS)
            ├── Google Gemini (@google/genai)
            └── Cheerio (HTML scraping, extract endpoint only)
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 8 + TypeScript + Tailwind CSS |
| UI Components | shadcn/ui (`@base-ui/react` primitives) |
| Backend | Vercel Serverless Functions (Node.js runtime, 10 functions) |
| Database | Supabase PostgreSQL + Row Level Security |
| Auth | Supabase Auth (password, magic link, password recovery) |
| AI | Google Gemini via `@google/genai` |
| Vector Search | pgvector (Supabase extension, 768-dim `gemini-embedding-2`) |
| Monitoring | Sentry (full-stack) |
| PWA | vite-plugin-pwa + Workbox |

---

## API Structure

Each endpoint is a standalone Vercel serverless function at `api/<name>.ts`. There is no router. Vercel maps `/api/<name>` to the corresponding file automatically.

```
api/
├── _lib/
│   ├── cache.ts        # URL and AI result caching helpers
│   ├── cors.ts         # setCorsHeaders()
│   ├── gemini.ts       # getGeminiClient(), generateJson() (logs to gemini_logs)
│   ├── prompts.ts      # Default AI prompt templates
│   ├── rateLimit.ts    # checkRateLimit(), DAILY_LIMIT = 100
│   ├── schemas.ts      # Zod request body schemas
│   ├── sentry.ts       # Server-side Sentry init
│   └── supabase.ts     # getServerSupabase(), getSettings(), getUserId()
├── account.ts          # Admin dashboard (GET) + account deletion (DELETE)
├── extract.ts          # URL scrape / photo / PDF → recipe JSON
├── find-image.ts       # Unsplash image search
├── nutrition.ts        # Nutrition estimates
├── scale.ts            # AI-assisted serving size scaling
├── share.ts            # Recipe sharing (send / accept / reject)
├── shopping.ts         # Shopping list generation from meal plan
├── suggest.ts          # Ingredient-based recipe suggestions
├── tag.ts              # Recipe tagging + text embedding
└── translate.ts        # Recipe translation (cached in DB)
```

Every handler follows the same flow:
1. `setCorsHeaders(res)` + OPTIONS guard + method guard
2. Zod parse `req.body`
3. Check DB/URL cache → return cached result (bypasses rate limit)
4. `checkRateLimit(supabase, userId)` → 429 if exceeded
5. `getSettings(supabase, userId)` → user's model + prompts
6. Call Gemini via `generateJson()`
7. Return JSON + log to `gemini_logs`

---

## Database Schema

38 migrations in `/supabase/migrations/`. Key tables:

### `recipes`
Central table. All columns are per-user via `user_id`. `ingredients` is always `Ingredient[]` (enforced by a DB check constraint since migration 0036). `embedding` (vector 768) stores text embeddings for pgvector similarity search.

### `settings`
One row per user, keyed by `user_id`. A global fallback row (`id=1, user_id=null`) holds defaults for users who haven't saved settings yet. The `id` column uses a sequence starting at 2 so new rows don't collide with the fallback. Stores: `gemini_model`, `gemini_prompt_*` (one per endpoint), `temperature_unit`.

### `gemini_logs`
One row per `generateJson()` call. Used for: Sentry-correlated error tracing, the admin usage dashboard, per-user rate limiting (count of today's rows by `user_id`), and the usage meter in Settings.

### Other tables
`meal_plan`, `shopping_list`, `pantry_items`, `recipe_translations`, `recipe_shares`, `contacts`, `collections`, `recipe_collections`, `url_cache`, `ai_cache`.

---

## Key Patterns

### Per-User Settings
`getSettings(supabase, userId?)` tries the user's row (`user_id = userId`) first. Falls back to the global `id=1` row if no per-user row exists yet. The frontend upserts on `user_id` conflict, so saving settings is idempotent.

### Rate Limiting
`checkRateLimit(supabase, userId)` counts `gemini_logs` rows for today (UTC midnight reset). Limit: 100 calls/day. Checked **after** cache lookups so cached responses don't consume quota. The `DAILY_LIMIT` constant is exported from `rateLimit.ts` and imported by `useUsage.ts` — no duplication.

### Vector Similarity Search
`tag.ts` generates a 768-dimensional embedding (`gemini-embedding-2`) for every recipe and stores it in `recipes.embedding`. `suggest.ts` generates an embedding from the user's ingredient list and calls the `match_recipes` pgvector function (cosine similarity, threshold 0.1). Falls back to in-memory string scoring if the vector search returns nothing.

### Ingredients Normalisation
The `ingredients` column is guaranteed to be `Ingredient[]` on all rows created after migration 0036. Legacy data was migrated in the same migration. A Postgres check constraint (`chk_ingredients_format`) prevents future regressions. Frontend code still uses `parseIngredients()` defensively for safety.

### Recipe Sharing
`recipe_shares` uses `auth.email() = recipient_email` for RLS so recipients can read their inbox without a `user_id` lookup. The `accept` action runs server-side with the service key, copying the full recipe + all translations to the recipient's vault.

### Vercel Function Count
The Hobby plan limit is 12 serverless functions. Currently 10 are deployed. Before adding a new `api/*.ts` file, either merge it with an existing endpoint or upgrade the plan.

---

## Frontend Data Flow

Most reads go directly from the browser to Supabase (via RLS-enforced anon key):

```
Component → hook (useRecipes, useMealPlans, …) → supabase.from().select()
```

AI operations go through the API:

```
Component → apiFetch() → api/*.ts → Gemini → response → optimistic UI update
```

`apiFetch()` in `src/lib/api.ts` automatically attaches the Supabase session Bearer token to every request. API functions call `getUserId(req.headers.authorization)` to extract the user.

---

## Auth Flow

Supabase Auth handles login, magic links, and password recovery. `useAuth` in `src/hooks/useAuth.ts` subscribes to `onAuthStateChange`. The password recovery state machine is intentionally held open on `SIGNED_IN` events (Supabase fires `PASSWORD_RECOVERY` then immediately `SIGNED_IN`) and only closed on `USER_UPDATED`, so `AuthGate` can render the set-new-password form correctly.
