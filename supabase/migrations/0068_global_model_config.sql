-- The AI models are chosen once, for everyone, by the admin.
--
-- Until now each person picked their own: settings.gemini_model and
-- settings.task_models on their own row, read first by getSettings(). That let
-- anyone put every task on the Frontier tier, which Google gives no free
-- allowance at all, so on a key without billing each of their AI calls failed
-- with a quota error. Model choice is a cost and reliability decision about the
-- app's one API key, not a personal preference.
--
-- From here on the global row (id = 1, user_id null) is the only place the
-- models are read from. getSettings() takes gemini_model and task_models from
-- it and only temperature_unit from the person's own row. The admin writes it
-- through POST /api/account?action=models (service key: settings_update in
-- 0020 keeps every user off this row, and the pgTAP suite checks that). Users
-- read it directly, under settings_select (0012: user_id is null), to show
-- which model each task runs on.
--
-- The per-user columns stay, unread, rather than being dropped: dropping them
-- would break an older build still open in someone's browser that selects
-- them, and they cost nothing.
--
-- Starting point: the recommended assignment that Settings already offered
-- under "Use recommended" (AI_TASKS in src/lib/constants.ts): Lite for every
-- task except translation, which stays on Standard. Standard is also the
-- main model, so a task added later without an entry falls back to it.

insert into public.settings (id, user_id, gemini_model, task_models)
values (
  1,
  null,
  'gemini-4-hydrogen',
  '{
    "extract":   "gemini-3.5-flash-lite",
    "translate": "gemini-4-hydrogen",
    "suggest":   "gemini-3.5-flash-lite",
    "tag":       "gemini-3.5-flash-lite",
    "nutrition": "gemini-3.5-flash-lite",
    "scale":     "gemini-3.5-flash-lite",
    "shopping":  "gemini-3.5-flash-lite"
  }'::jsonb
)
on conflict (id) do update
  set user_id = null,
      gemini_model = excluded.gemini_model,
      task_models = excluded.task_models;

comment on column public.settings.gemini_model is
  'Main Gemini model. Read from the global row (id = 1) only; per-user values are ignored since migration 0068. Set by the admin.';
comment on column public.settings.task_models is
  'Per-task Gemini model overrides keyed by AiTask. Read from the global row (id = 1) only; per-user values are ignored since migration 0068. A missing key falls back to gemini_model. See modelFor() in api/_lib/supabase.ts.';

-- The System tab probes every configured model. Only the global row's are
-- configured now; a stale id left on someone's row would cost a probe and
-- report on a model nothing runs.
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
          select nullif(s.gemini_model, '') as m from public.settings s where s.id = 1
          union
          select nullif(t.value, '') from public.settings s,
                 jsonb_each_text(case when jsonb_typeof(s.task_models) = 'object' then s.task_models else '{}'::jsonb end) t
           where s.id = 1
        ) ids
       where m is not null
    ), '[]'::jsonb)
  );
end;
$$;

-- create or replace keeps the grants from 0067, but restating them costs
-- nothing and keeps this file correct on its own.
revoke all on function public.system_health() from public, anon, authenticated;
grant execute on function public.system_health() to service_role;
