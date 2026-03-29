-- Tighten settings RLS: authenticated users must not be able to modify the
-- global id=1 row (which API endpoints read via service key).
-- Users may only insert/update their own row (user_id = auth.uid()).
-- Select still allows reading the global row as a read-only fallback.

drop policy if exists "settings_update" on public.settings;
drop policy if exists "settings_insert" on public.settings;

-- Users can only update their own row, never the global one
create policy "settings_update"
  on public.settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can only insert a row for themselves
create policy "settings_insert"
  on public.settings for insert
  with check (auth.uid() = user_id);
