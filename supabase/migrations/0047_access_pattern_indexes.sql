-- Index the columns the app actually filters and sorts on.
--
-- The schema had six indexes and none matched the query shapes. Every table is
-- scoped by RLS on user_id, and the list views sort in the database, so each of
-- these was a sequential scan plus a sort. Harmless at the current row counts,
-- and the kind of thing that is only noticed once it is already a problem.
--
-- Columns chosen from the queries themselves rather than assumed: recipe_shares
-- is looked up by recipient_email, not user_id, and recipe_translations by
-- recipe_id.

-- Vault: filtered by owner, sorted by newest first (the default), then by
-- title / rating / is_favourite for the other sort options.
create index if not exists recipes_user_created_idx
  on public.recipes (user_id, created_at desc);
create index if not exists recipes_user_title_idx
  on public.recipes (user_id, title);

-- Rate limiting counts today's calls for one user before every AI request.
-- The existing index covers created_at alone, which is the less selective half.
create index if not exists gemini_logs_user_created_idx
  on public.gemini_logs (user_id, created_at desc);

-- Meal planner reads the whole plan for a user ordered by date.
create index if not exists meal_plan_user_date_idx
  on public.meal_plan (user_id, date);

create index if not exists shopping_list_user_idx
  on public.shopping_list (user_id);

create index if not exists collections_user_created_idx
  on public.collections (user_id, created_at);

create index if not exists recipe_collections_collection_idx
  on public.recipe_collections (collection_id);
create index if not exists recipe_collections_recipe_idx
  on public.recipe_collections (recipe_id);

-- The inbox looks up pending shares by recipient address, not by owner.
create index if not exists recipe_shares_recipient_idx
  on public.recipe_shares (recipient_email, status, created_at desc);

-- Translations are fetched for a batch of recipe ids at a time.
create index if not exists recipe_translations_recipe_idx
  on public.recipe_translations (recipe_id);
