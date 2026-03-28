-- Phase 6: Per-user data isolation with Supabase Auth
-- Run this after enabling Authentication in your Supabase project dashboard
-- and configuring Google OAuth / Email (magic link) providers.

-- ─── Add user_id columns ──────────────────────────────────────────────────────
alter table public.recipes
  add column if not exists user_id uuid references auth.users(id);

alter table public.meal_plan
  add column if not exists user_id uuid references auth.users(id);

alter table public.shopping_list
  add column if not exists user_id uuid references auth.users(id);

-- ─── Redesign settings for per-user rows ─────────────────────────────────────
-- Drop the single-row constraint so each user can have their own settings row
alter table public.settings
  drop constraint if exists settings_single_row;

alter table public.settings
  add column if not exists user_id uuid references auth.users(id);

-- The old id=1 global row stays as a fallback for legacy API endpoints
alter table public.settings
  add constraint settings_unique_user unique (user_id);

-- ─── recipes RLS ──────────────────────────────────────────────────────────────
drop policy if exists "Enable read access for all users" on public.recipes;
drop policy if exists "Enable insert access for all users" on public.recipes;
drop policy if exists "Enable update access for all users" on public.recipes;
drop policy if exists "Enable delete access for all users" on public.recipes;

-- During transition: existing recipes (user_id IS NULL) are accessible to any
-- authenticated user. Once "Claim existing recipes" is run they get a user_id.
create policy "recipes_select"
  on public.recipes for select
  using (auth.uid() = user_id or user_id is null);

create policy "recipes_insert"
  on public.recipes for insert
  with check (auth.uid() = user_id);

create policy "recipes_update"
  on public.recipes for update
  using (auth.uid() = user_id or user_id is null);

create policy "recipes_delete"
  on public.recipes for delete
  using (auth.uid() = user_id or user_id is null);

-- ─── meal_plan RLS ────────────────────────────────────────────────────────────
alter table public.meal_plan enable row level security;

create policy "meal_plan_select"
  on public.meal_plan for select
  using (auth.uid() = user_id or user_id is null);

create policy "meal_plan_insert"
  on public.meal_plan for insert
  with check (auth.uid() = user_id);

create policy "meal_plan_update"
  on public.meal_plan for update
  using (auth.uid() = user_id or user_id is null);

create policy "meal_plan_delete"
  on public.meal_plan for delete
  using (auth.uid() = user_id or user_id is null);

-- ─── shopping_list RLS ────────────────────────────────────────────────────────
alter table public.shopping_list enable row level security;

create policy "shopping_list_select"
  on public.shopping_list for select
  using (auth.uid() = user_id or user_id is null);

create policy "shopping_list_insert"
  on public.shopping_list for insert
  with check (auth.uid() = user_id);

create policy "shopping_list_update"
  on public.shopping_list for update
  using (auth.uid() = user_id or user_id is null);

create policy "shopping_list_delete"
  on public.shopping_list for delete
  using (auth.uid() = user_id or user_id is null);

-- ─── settings RLS (per-user) ──────────────────────────────────────────────────
drop policy if exists "Allow all access to settings" on public.settings;

create policy "settings_select"
  on public.settings for select
  using (auth.uid() = user_id or user_id is null);

create policy "settings_insert"
  on public.settings for insert
  with check (auth.uid() = user_id);

create policy "settings_update"
  on public.settings for update
  using (auth.uid() = user_id or user_id is null);
