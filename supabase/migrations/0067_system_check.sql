-- The admin System tab: whether reasoning really was off, and what the
-- database itself can say about its health.
--
-- 1. gemini_logs.thinking, per AI call:
--      'on'       ran with reasoning (the default for most tasks)
--      'off'      asked for no reasoning and got it
--      'refused'  asked for none; the model only runs in thinking mode, answered
--                 with a 400, and generateJson ran the call again with it on
--    Null for rows written before this migration. No CHECK constraint: the
--    insert is fire-and-forget, so a value the constraint did not know would
--    lose the whole row, and the daily allowance is counted from these rows.
--
-- 2. gemini_thinking_usage(since): those values counted per endpoint and model,
--    for the reasoning table. Counted here, not by fetching rows, because the
--    API returns at most 1000 rows per request, silently (see 0066).
--
-- 3. system_health(): facts only the database knows — its version, pgvector,
--    whether `recipes` is in the Realtime publication (without it the card
--    spinner falls back to polling, see 0059), the newest migration applied,
--    and which model ids any user has configured, so the check probes those
--    too and not only the three offered tiers.

alter table public.gemini_logs add column if not exists thinking text;

comment on column public.gemini_logs.thinking is
  'on | off | refused — whether this call ran with reasoning. refused: asked for off, the model required it.';

create or replace function public.gemini_thinking_usage(since timestamptz)
returns table (endpoint text, model text, thinking text, call_count bigint)
language sql
stable
set search_path = ''
as $$
  select l.endpoint,
         coalesce(nullif(l.model, ''), '(none)') as model,
         coalesce(l.thinking, 'unrecorded') as thinking,
         count(*) as call_count
    from public.gemini_logs l
   where l.created_at >= since
   group by 1, 2, 3
   order by 1, 2, 3;
$$;

-- Security definer for one reason: the migrations table lives in the
-- supabase_migrations schema, which the service role is not granted. The
-- search path is pinned and every name below is schema-qualified, so the
-- function cannot be pointed at anything else; it takes no arguments and
-- returns no row data.
create or replace function public.system_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  latest text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select max(version) from supabase_migrations.schema_migrations' into latest;
  end if;

  return jsonb_build_object(
    'postgres_version', current_setting('server_version'),
    'pgvector_version', (select e.extversion from pg_catalog.pg_extension e where e.extname = 'vector'),
    'realtime_recipes', exists (
      select 1 from pg_catalog.pg_publication_tables p
       where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = 'recipes'
    ),
    'latest_migration', latest,
    'configured_models', coalesce((
      select jsonb_agg(distinct m order by m)
        from (
          select nullif(s.gemini_model, '') as m from public.settings s
          union
          select nullif(t.value, '') from public.settings s,
                 jsonb_each_text(case when jsonb_typeof(s.task_models) = 'object' then s.task_models else '{}'::jsonb end) t
        ) ids
       where m is not null
    ), '[]'::jsonb)
  );
end;
$$;

-- Both for the admin endpoint only, which calls them with the service key.
-- Supabase grants EXECUTE on new functions to anon and authenticated by
-- default privilege, so revoking from PUBLIC alone would leave both in place.
revoke all on function public.gemini_thinking_usage(timestamptz) from public, anon, authenticated;
grant execute on function public.gemini_thinking_usage(timestamptz) to service_role;
revoke all on function public.system_health() from public, anon, authenticated;
grant execute on function public.system_health() to service_role;
