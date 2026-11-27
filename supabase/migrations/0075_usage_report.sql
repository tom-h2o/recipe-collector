-- The admin's Usage tab (Admin → Usage): who uses the app, how often, and for
-- what. Counted from what the database already holds, plus one new fact.
--
-- The new fact is app_opens: one row per person per UTC day on which they
-- opened the app, written by GET /api/account?tab=whoami, which the app calls
-- once per load. Before it, only saving something left a trace, and the most
-- common use (reading and cooking from a recipe) counted as nobody. It holds
-- the date and nothing else, and goes with the account.

create table if not exists public.app_opens (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);

-- No policies: only the server writes it (service key), and only
-- admin_usage() below reads it. Not even the person themselves reads it
-- through the API.
alter table public.app_opens enable row level security;

comment on table public.app_opens is
  'One row per person per UTC day the app was opened, for the admin Usage tab. The date only.';

-- The report itself. SECURITY DEFINER to read auth.users (addresses, sign-in
-- times) alongside the app's tables; executable by the service key only.
--
-- "Active" on a day: opened the app (app_opens), or saved something of any
-- kind (a recipe, an import, an AI call, a meal plan entry, a list or pantry
-- item, a rating, a collection, a share, an invitation). Reading alone counts
-- only from the day app_opens started, which tracking_since reports.
--
-- The AI figures come from gemini_logs, which keeps 30 days (migration 0030),
-- so they never reach further back than that whatever the period.
create or replace function public.admin_usage(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    select d.days,
           d.today,
           d.today - (d.days - 1) as first_day,
           ((d.today - (d.days - 1))::timestamp at time zone 'utc') as period_start,
           -- Eight weeks, Monday to Sunday, the current one last.
           (date_trunc('week', d.today::timestamp)::date - 49) as first_week
      from (select greatest(1, least(coalesce(p_days, 30), 90)) as days,
                   (now() at time zone 'utc')::date as today) d
  ),
  activity as (
    select distinct a.user_id, a.day
      from (
        select o.user_id, o.day from public.app_opens o
        union all select u.user_id, u.day from public.ai_usage u
        union all select r.user_id, (r.created_at at time zone 'utc')::date from public.recipes r
        union all select i.user_id, (i.created_at at time zone 'utc')::date from public.recipe_imports i
        union all select g.user_id, (g.created_at at time zone 'utc')::date from public.gemini_logs g
                   where g.endpoint <> 'health-check'
        union all select m.user_id, (m.created_at at time zone 'utc')::date from public.meal_plan m
        union all select s.user_id, (s.created_at at time zone 'utc')::date from public.shopping_list s
        union all select p.user_id, (p.created_at at time zone 'utc')::date from public.pantry_items p
        union all select t.user_id, (t.updated_at at time zone 'utc')::date from public.recipe_ratings t
        union all select c.user_id, (c.created_at at time zone 'utc')::date from public.collections c
        union all select h.sender_id, (h.created_at at time zone 'utc')::date from public.recipe_shares h
        union all select l.requester_id, (l.created_at at time zone 'utc')::date from public.account_links l
      ) a, b
     where a.user_id is not null
       and a.day >= least(b.first_day, b.first_week)
  ),
  in_period as (
    select a.user_id, a.day from activity a, b where a.day >= b.first_day
  ),
  logs as (
    select g.user_id, g.endpoint, g.status
      from public.gemini_logs g, b
     where g.created_at >= b.period_start
       and g.endpoint <> 'health-check'
  )
  select jsonb_build_object(
    'days', b.days,
    'first_day', b.first_day,
    'today', b.today,
    'tracking_since', (select min(o.day) from public.app_opens o),
    'totals', jsonb_build_object(
      'active_people', (select count(distinct p.user_id) from in_period p),
      'recipes_added', (select count(*) from public.recipes r where r.created_at >= b.period_start),
      -- find-image is an Unsplash search, not AI (shared/usage.ts).
      'ai_calls', (select count(*) from logs l where l.endpoint <> 'find-image'),
      'iphone_imports', (select count(*) from public.recipe_imports i where i.created_at >= b.period_start),
      'shares_sent', (select count(*) from public.recipe_shares h where h.created_at >= b.period_start),
      'connections_made', (select count(*) from public.account_links l where l.accepted_at >= b.period_start)
    ),
    'weeks', (
      select coalesce(jsonb_agg(w order by w.week_start), '[]'::jsonb)
        from (
          select ws::date as week_start,
                 (select count(distinct a.user_id) from activity a
                   where a.day >= ws::date and a.day < ws::date + 7) as active_people,
                 (select count(*) from public.recipes r
                   where r.created_at >= (ws at time zone 'utc')
                     and r.created_at < ((ws + interval '7 days') at time zone 'utc')) as recipes_added
            from generate_series(b.first_week::timestamp, b.today::timestamp, interval '7 days') ws
        ) w
    ),
    'features', (
      select coalesce(jsonb_agg(f order by f.calls desc, f.endpoint), '[]'::jsonb)
        from (
          select l.endpoint,
                 count(*) as calls,
                 count(distinct l.user_id) as people,
                 count(*) filter (where l.status = 'error') as failed
            from logs l
           group by l.endpoint
        ) f
    ),
    'imports', (
      select coalesce(jsonb_agg(x order by x.count desc, x.source), '[]'::jsonb)
        from (
          select i.source,
                 count(*) as count,
                 count(*) filter (where i.status = 'failed') as failed
            from public.recipe_imports i
           where i.created_at >= b.period_start
           group by i.source
        ) x
    ),
    'people', (
      select coalesce(jsonb_agg(p order by p.last_active desc nulls last, p.email), '[]'::jsonb)
        from (
          select u.id,
                 u.email,
                 u.created_at,
                 u.last_sign_in_at,
                 (select max(a.day) from activity a where a.user_id = u.id) as last_active,
                 (select count(*) from in_period p where p.user_id = u.id) as active_days,
                 (select count(*) from public.recipes r where r.user_id = u.id) as recipes_total,
                 (select count(*) from public.recipes r
                   where r.user_id = u.id and r.created_at >= b.period_start) as recipes_added,
                 (select count(*) from logs l
                   where l.user_id = u.id and l.endpoint <> 'find-image') as ai_calls
            from auth.users u
           order by last_active desc nulls last, u.email
           limit 200
        ) p
    )
  )
  from b;
$$;

revoke all on function public.admin_usage(integer) from public, anon, authenticated;
grant execute on function public.admin_usage(integer) to service_role;
