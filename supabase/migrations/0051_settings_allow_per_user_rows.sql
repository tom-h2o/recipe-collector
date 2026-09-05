-- Per-user settings have never actually worked.
--
-- 0003 created the table as a deliberate single-row store:
--   constraint settings_single_row check (id = 1)
-- 0038 later moved id onto a sequence starting at 2 so each user could have
-- their own row -- but never dropped that check. Every insert since has been
-- rejected with "violates check constraint settings_id_check", including the
-- one an upsert performs: Postgres evaluates CHECK constraints on the proposed
-- tuple *before* it looks for the ON CONFLICT arbiter, so even a save by a user
-- whose row already exists fails.
--
-- The visible symptom was that nobody could change their Gemini model or
-- temperature unit. It went unnoticed because the failure is a toast on a
-- setting people rarely touch, and because the one existing row was being
-- edited by migrations (0026, 0044, 0045, 0050) rather than by anyone using
-- the app.
alter table public.settings drop constraint if exists settings_single_row;
alter table public.settings drop constraint if exists settings_id_check;

-- The id=1 row is documented as the global fallback that API endpoints read
-- when a user has no row of their own (getSettings in api/_lib/supabase.ts).
-- It had acquired a user_id, which meant every other user was silently
-- inheriting one particular person's settings. Hand it back to nobody.
update public.settings set user_id = null where id = 1;

-- upsert(..., { onConflict: 'user_id' }) in useSettings.ts needs a unique index
-- on exactly this column, or the conflict target does not resolve and each save
-- appends another row. Not partial: PostgREST cannot supply the WHERE clause a
-- partial index would require. Multiple NULLs stay legal in a unique index, so
-- the global row is unaffected.
create unique index if not exists settings_user_id_key
  on public.settings (user_id);

-- Keep the sequence ahead of any id already in the table.
select setval('settings_id_seq', greatest((select max(id) from public.settings), 1) + 1, false);
