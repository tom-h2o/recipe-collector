-- Let the browser hear about a recipe finishing its AI pass, instead of asking.
--
-- After a save, the store polls the row every 2s for up to 30s waiting for
-- tags and nutrition to appear. That is up to 15 round trips per recipe, each
-- one a full PostgREST request, and the spinner can still lag the truth by
-- two seconds.
--
-- postgres_changes only delivers for tables in this publication, so without
-- this migration the subscription connects, reports SUBSCRIBED, and then sits
-- silent forever — which is exactly the failure that would look like a hung
-- spinner. The client keeps a slower poll running alongside for that reason.
--
-- RLS still applies to what Realtime sends: a subscriber is only given rows
-- that `recipes_select` would let them read, so this adds no new visibility.
-- The default replica identity (primary key) is enough here because the
-- client reads the `new` record only.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- A plain Postgres (local pgTAP runs, a self-hosted instance) has no such
    -- publication. Nothing to do: Realtime is not serving there either.
    raise notice 'publication supabase_realtime not present; skipping';
    return;
  end if;

  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'recipes'
  ) then
    raise notice 'public.recipes is already published; nothing to do';
    return;
  end if;

  alter publication supabase_realtime add table public.recipes;
end $$;
