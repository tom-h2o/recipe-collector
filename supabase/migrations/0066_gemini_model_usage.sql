-- Model usage for the admin overview, counted in the database.
--
-- api/account.ts built this chart by selecting `model, model_version` from
-- every gemini_logs row and tallying them in JavaScript, because PostgREST
-- cannot GROUP BY. That was known to be unbounded; what was not noticed is
-- that it was also wrong. The API returns at most 1000 rows per request
-- (`max_rows` in supabase/config.toml, and the hosted default), silently. So
-- past a thousand log rows the chart counted an arbitrary thousand of them
-- while "Total AI calls" beside it, a head-only count, showed the real figure.
-- At 100 calls a day per user and 30 days of retention, that is one busy user.
--
-- Grouped by the model that actually ran, falling back to the id that was
-- requested for rows written before 0050 recorded the resolved version —
-- the same rule the JavaScript applied (`model_version || model`).

create or replace function public.gemini_model_usage()
returns table (model text, call_count bigint)
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(l.model_version, ''), nullif(l.model, '')) as model,
         count(*) as call_count
    from public.gemini_logs l
   where coalesce(nullif(l.model_version, ''), nullif(l.model, '')) is not null
   group by 1
   order by 2 desc, 1;
$$;

-- For the admin endpoint only, which calls it with the service key. It runs
-- with the caller's rights, so row level security would already confine anyone
-- else to their own rows; the revoke is so the question never comes up.
-- Supabase grants EXECUTE on new functions to anon and authenticated by
-- default privilege, so revoking from PUBLIC alone would leave both in place.
revoke all on function public.gemini_model_usage() from public, anon, authenticated;
grant execute on function public.gemini_model_usage() to service_role;
