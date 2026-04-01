# Future Improvements

Ideas captured during development. Tackle when time allows.

---

## Medium Effort

### Server-side full-text search
Currently search is client-side and only covers the loaded page of recipes (PAGE_SIZE=24). Large libraries are effectively unsearchable.
- Add a `fts` column to the `recipes` table using `to_tsvector` (Postgres full-text search)
- Replace the client-side filter in `RecipeVault` with a Supabase `.textSearch()` call
- Requires a migration

### Meal planner week navigation
The planner only shows the current 7 days. No way to plan ahead or look at past weeks.
- Add prev/next week buttons to `MealPlanner`
- Offset the date range by ±7 days per click

### Prep/cook time missing from AI-extract flow
`extract.ts` may return `prep_time_mins` / `cook_time_mins` but `handleExtractUrl` in `RecipeForm` doesn't set those fields. Now that the form has inputs for them, verify the API response is wired through.

---

## Bigger Changes

### PWA / offline support
The app is installable (has a manifest) but has no service worker. Recipes don't load without internet.
- Add a Vite PWA plugin (`vite-plugin-pwa`)
- Cache the recipe list and images with a stale-while-revalidate strategy

### Recipe collections / folders
Tags work for categorisation but a proper folder concept (e.g. "Weekend projects", "Kid-friendly") would be useful for larger libraries.
- New `collections` table with a `recipe_collections` join table
- UI: folder sidebar or dropdown in RecipeVault

### Ingredient reordering in the editor
The structured ingredient editor has no way to reorder rows.
- Add up/down arrow buttons per row (simple, no drag library needed)
- Or integrate `@dnd-kit/sortable` for drag-to-reorder

### Cook mode timer
The step-by-step cook mode has no built-in timer despite most recipe steps mentioning times.
- Add a per-step countdown timer (parse time from step text, e.g. "simmer for 10 minutes")
- Or a simple manual stopwatch/countdown in the cook mode header

### Nutritional goals / tracking
Currently nutrition is shown per recipe but not tracked or compared against daily goals.
- Let users set daily targets in Settings
- Show a daily summary on the meal planner

### suggest.ts limited to last 50 recipes
`/api/suggest` only queries the last 50 recipes when suggesting from available ingredients — easy to miss for large libraries.
- Increase the limit or use a smarter embedding/search approach

---

## Known Dead Code

- `recipeToIngredientText` in `src/lib/recipeUtils.ts` — no longer used in production code after the structured ingredient editor was introduced. Still has a test in `recipeUtils.test.ts` so the export can stay, but callers in app code are gone.
