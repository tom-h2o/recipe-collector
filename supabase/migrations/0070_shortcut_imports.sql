-- Sending recipes from the iPhone's Photos app, through an Apple Shortcut.
--
-- Safari does not support the Web Share Target API, so a web app cannot appear
-- in the iPhone's share sheet. A Shortcut can: it takes the selected photos,
-- posts them to POST /api/extract?via=shortcut with a personal key, and the
-- server reads them, saves the recipe and enriches it (tags, nutrition). The
-- app then shows what arrived the next time it is opened.

-- ── The personal key ───────────────────────────────────────────────────────
-- One per person. Only a SHA-256 hash is stored; the key itself is shown once,
-- when it is made. No policy at all: the service key is the only reader and
-- writer (the account endpoint creates, rotates and revokes it), so nobody can
-- read a hash through the API, not even their own.
create table if not exists public.shortcut_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.shortcut_keys enable row level security;
revoke all on table public.shortcut_keys from anon, authenticated;

comment on table public.shortcut_keys is
  'Personal keys for the iPhone Shortcut import (POST /api/extract?via=shortcut). SHA-256 hash only. Service key only: no policies.';

-- ── What arrived ───────────────────────────────────────────────────────────
-- One row per recipe the Shortcut asked for: processing while it is read,
-- then saved (with the recipe) or failed (with the reason). seen_at is set
-- when the person opens the recipe or dismisses a failure, which is what
-- drives the "new recipes from your photos" banner and the New badge.
create table if not exists public.recipe_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'processing' check (status in ('processing', 'saved', 'failed')),
  page_count integer not null default 1 check (page_count between 1 and 8),
  -- Deleting the recipe deletes its import row with it, so a deleted recipe
  -- never keeps a banner or a badge alive.
  recipe_id uuid references public.recipes(id) on delete cascade,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  seen_at timestamptz
);

create index if not exists recipe_imports_unseen
  on public.recipe_imports (user_id, created_at desc)
  where seen_at is null;

alter table public.recipe_imports enable row level security;

-- Each person sees their own imports, and may mark them seen. Nothing else:
-- rows are created and finished by the server with the service key, and the
-- column grant below keeps an update to seen_at alone.
drop policy if exists recipe_imports_select on public.recipe_imports;
create policy recipe_imports_select on public.recipe_imports
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists recipe_imports_mark_seen on public.recipe_imports;
create policy recipe_imports_mark_seen on public.recipe_imports
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.recipe_imports from anon, authenticated;
grant select on table public.recipe_imports to authenticated;
grant update (seen_at) on table public.recipe_imports to authenticated;

comment on table public.recipe_imports is
  'Recipes sent from the iPhone Shortcut: processing, saved or failed. Owners read their rows and set seen_at only.';
