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

### Shipped later (PRs #7–#28)

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
- ✅ **Model tiers follow Google's current release** — the three tiers use `-latest` aliases instead of pinned ids, so a new Gemini release needs no code change. Safe only because `generateJson()` now records the response's `modelVersion` in `gemini_logs.model_version`; the logs UI and admin breakdown show the resolved model, not the alias
- ✅ **Recipe PDF export** — the print button existed but printed the app: the drawer on a blurred backdrop, a decorative gradient over the top third, and the servings +/- buttons. There is now a real print sheet, and the saved file is named after the recipe. The `print-*` CSS the old note called "print-optimised" styled classes no component ever applied
- ✅ **Cook mode timer** — durations mentioned in a step become one-tap chips (25% of steps in this vault name one, across en/de/pl), plus a manual set. Driven by a wall-clock deadline so a locked phone does not lose time
- ✅ **Per-person ratings** — rating lived on the recipe row, so there was one and it belonged to whoever owned it; connected accounts can now each rate the same dish and see the other's
- ✅ **Collections in the vault UI** — `RecipeVault` renders collection filter chips and `RecipeDetail` has add/remove handlers; both halves of the old entry are done

---

## Quick Wins

- ✅ **Meal planner week navigation** — prev/next week buttons with `weekOffset` state; shows weekly calorie total

### Rate limit indicator in the header
Currently only visible after opening Settings → Usage Logs. A lightweight indicator in the navbar (e.g. a small pill showing "82/100 today") would be more discoverable without requiring navigation.

- ✅ **Plain-text recipe import** — a fourth import tab beside URL, photo and PDF: paste a recipe from a chat, a note or another app and Gemini structures it. Handled inside `api/extract.ts` (`{ text }`), so it needs no new serverless function

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

### Admin-managed model list (no deploy needed)
Considered and deliberately deferred — the `-latest` aliases removed most of the
pressure for it, since a new Google release no longer needs a code change at all.
Worth building if a release ever regresses and the tiers need pinning back in a
hurry, or if the tier line-up itself should change without a deploy.

**Shape.** A `model_options` table mirroring `MODEL_OPTIONS` (`id`, `name`,
`badge`, `description`, `price`, `sort_order`, `is_default`), edited from a new
tab in `AdminPanel`. `MODEL_OPTIONS` in `constants.ts` stays as the seed *and*
the fallback: an empty or unreachable table means the hardcoded list is used, so
the dropdown can never come up empty.

**Endpoint.** Goes into `api/account.ts` as another action behind the existing
`assertAdmin()`, not a new file — Vercel Hobby caps at 12 functions and 10 are in
use. See the function-limit note in CLAUDE.md.

**Validation before save is the whole point.** On save the server calls
`generateContent` once against the submitted id and refuses the write if it
errors, surfacing Google's own message. `gemini-2.5-flash-lite` reached the
dropdown precisely because `ListModels` advertised it while every real call
returned 404 (migration 0044) — a list endpoint is not evidence a model serves
requests, so the only honest check is making the call. Store the response's
`modelVersion` alongside the row so the panel can show `gemini-flash-latest →
gemini-3.8-flash` per tier.

**Setting the default** has to do what migration 0050 did by hand: update every
`settings` row in the same request, because the standing policy is that all users
move to the new default together.

**The risk to hold in view.** This creates a way to change what every user's AI
calls run against, from a web form, with no deploy and no review. Validation stops
a *broken* id, not an expensive one — Pro is roughly 3× Flash — so the confirm
step should show the price delta rather than pretend that isn't a real button.

### Playwright upgrade, so the runner can move off 24.04
CI runners are pinned to `ubuntu-24.04` because GitHub moved `ubuntu-latest` to
26.04 and Playwright 1.60 refuses to install there. The project is on `^1.60.0`;
1.65 is current. Upgrading Playwright and unpinning the runner should move
together, in one change, with the full E2E suite run against the new image before
merging.

Not urgent — 24.04 is supported for a long while yet. Pinned deliberately so an
image rollout cannot turn the pipeline red on unrelated work.

### Supabase CLI 3.x upgrade
Both CI jobs are pinned to 2.101.0 — the `rls` job through setup-cli, and
`migrate-production` through the `supabase` devDependency that `npx` resolves.
3.0 renames `[inbucket]` to `[local_smtp]` in config.toml and 2.x rejects the new
key, so the two have to move together, in one change, with `supabase/config.toml`
updated alongside.

Not urgent. Deliberately left pinned rather than tracking `latest`, because an
upstream release of a major version should not land on whichever pull request
happens to run next. `tests/unit/supabaseCliVersion.test.ts` fails if the two
pins drift apart or the config key stops matching.

### A second Gemini project, if the app ever matters daily
On 2026-09-15 three calls failed with `403 PERMISSION_DENIED` — "Your project has
been denied access" — and every AI feature was down until it cleared. There is one
Gemini project and no failover.

Worth knowing before building anything: a second **key** changes nothing, because
a project-level denial applies to every key in that project. Real failover means a
second Google Cloud project with its own billing, plus `resolveApiKey()` learning
to pick between them and the call path retrying once on an auth-shaped failure.

Deliberately not done. At current volume (39 AI calls in the logs, 2 new recipes in
two months) the ongoing cost of a second project outweighs an outage that cleared
on its own. The failure is at least legible now — `describeGeminiError()` tells the
user it is a configuration problem and not their recipe. Revisit if the app becomes
something depended on daily, or if the 403 recurs.

### Cook mode shows each step's share of an ingredient
Recipes often split an ingredient across steps: "half the onion now, the rest
later", "keep back a spoonful of the cream for the top". The ingredient list
should keep showing the **total** (it does, and that is right), but cook mode's
"For this step" should show only what **this** step uses. Today it cannot:
`ingredientsInStep()` (`src/lib/stepIngredients.ts`) only finds which
ingredients a step *mentions*, by matching words, and shows each with its full
amount.

**What is needed is a mapping, not a new list.** Per step, the ingredients it
uses and how much of each, pointing at the existing list by index:

```json
"step_ingredients": [
  [ { "i": 0, "share": 0.5 }, { "i": 3, "amount": "1 EL" } ],
  [ { "i": 0, "share": 0.5 } ],
  [ { "i": 3, "rest": true } ]
]
```

- `share` (a fraction of the total) where the recipe says "half", "a third";
  `amount` where it names a quantity ("1 EL davon"); `rest` for "the rest" /
  "the remaining". A fraction scales with the servings for free; an `amount`
  goes through `scaleAmount()`, as the list does.
- Indexes, not names: the mapping then survives a translation (the translated
  list keeps the same order) and a rename.
- Shown in cook mode as e.g. "½ of 2 Zwiebeln (1)" or "1 EL of 200 ml Sahne";
  the full list stays unchanged.

**Where the model call goes: in the post-save enrichment, not in extraction.**
Tagging and nutrition already run after every save (`api/_lib/enrich.ts`, from
the app and from the Shortcut import), so a third job there covers every way a
recipe arrives — link, photo, PDF, pasted text, **entered by hand** — and is
redone after every **edit**. Putting it into the extraction prompt would miss
manual and edited recipes and make the heaviest, slowest call heavier. It is a
small reading job: Haiku, reasoning lowered (`REASONING_OFF_TASKS`), a strict
response schema like the others. It costs one more AI call per save, which
counts against the daily allowance like tagging does.

**Guarding it:**
- Store it with a hash of the instructions and ingredients it was made from;
  cook mode uses it only while the hash matches and otherwise falls back to
  today's word matching. An edit that changes the steps can never show amounts
  for the wrong step in the meantime.
- Validate before storing: one entry per step (`splitSteps()`), indexes in
  range, shares between 0 and 1 and per ingredient adding up to about 1. A
  mapping that fails is dropped, not stored: the fallback is the current
  behaviour, which is fine.
- Existing recipes get it the next time they are saved, or through
  ⋯ → Regenerate (which already re-runs tagging), or a one-off backfill.

**Not decided:** whether to show it only where an ingredient is actually split
(otherwise "For this step" stays as it is), and how to word a share for things
that do not divide nicely ("½ Ei").

### Vault search that understands German, partial words and several words
The vault search is Postgres full-text search: `recipes.search_vector` (migration
0028) is generated from title, description and `ingredients::text`, and
`recipeStore.ts` queries it with `.textSearch('search_vector', query)`. Looked at
on 2026-11-25, it has five faults, found by reading the code (not reproduced
against production):

1. **English stemming on German recipes.** The column uses `to_tsvector('english', …)`,
   so "Kartoffel" does not find "Kartoffeln" and "Zwiebel" not "Zwiebeln".
2. **Whole words only.** "Kartoffel" does not find "Kartoffelsuppe", and nothing is
   found while a word is half typed ("Kart").
3. **Two words break the query.** `textSearch()` without a `type` sends
   `fts.<input>`, i.e. `to_tsquery('Kartoffel Suppe')`, which Postgres rejects as
   a tsquery syntax error. `fetchRecipes` ignores the error and only sets
   `recipes` when `data` is non-null, so the list silently keeps the previous
   result: the second word appears to be ignored.
4. **Not searched:** tags ("vegetarisch" only matches if it is in the title or
   description), instructions, translations.
5. **JSON keys are indexed.** `ingredients::text` puts `name`, `amount` and
   `details` into every recipe's vector, so searching "name" matches everything.

**Proposal (no AI, one migration):**
- Rebuild `search_vector` with the language-neutral `simple` config from title,
  description, tags, and only the ingredients' `name`/`details` values (not the
  JSON), with `setweight` so a title match ranks above an ingredient match.
  Instructions maybe at the lowest weight.
- Build the query in the app: split the input into words, strip tsquery
  operators, and send each word as a prefix (`kartoffel:* & suppe:*`). That fixes
  1–3: "Kartoffel" finds "Kartoffeln" and "Kartoffelsuppe", "Kart" works while
  typing, and several words are ANDed instead of failing.
- Surface a query error instead of silently keeping the old list.
- Tests: a unit test for the query builder (operators, quotes, umlauts, several
  words), a pgTAP or SQL check that the generated column holds what it should,
  and an e2e case typing two words.

**Optional, if it matters:** prefix search finds word *beginnings* only, so
"Suppe" still would not find "Kartoffelsuppe". Matching inside words needs a
trigram index (`pg_trgm`, `gin_trgm_ops`) and `ilike '%suppe%'` over title and
ingredient names; at this vault's size that is fast. Could run alongside the
full-text search (OR), or only when the full-text search finds nothing.

### Recipe version history
When a recipe is edited, the previous version is permanently overwritten with no way to undo.
- Store snapshots in a `recipe_versions` table on every update
- Add a "History" option in `RecipeDetail` to browse and restore previous versions

### Batch import queue
Currently importing multiple recipes requires opening each one individually. A queue-based approach would let users paste several URLs at once and have them processed in the background.

---

## Bigger Changes

- ✅ **Model usage breakdown counted in the database** — `getStats()` no longer downloads every `gemini_logs` row to tally them; `gemini_model_usage()` (migration 0066) groups them. The old query was also silently capped at 1000 rows by the API, so the chart was wrong past that

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

---

## Known Dead Code

- `recipeToIngredientText()` in `src/lib/recipeUtils.ts` — still no app callers; kept because it has a test in `recipeUtils.test.ts`
- ~~`useLanguagePreference`~~ — the file no longer exists; entry kept only to note it was already removed
