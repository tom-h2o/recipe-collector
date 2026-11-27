-- Feedback and bug reports from inside the app.
--
-- Until now the only way to report a fault or send an idea was to tell the
-- admin in person. A signed-in person can now write a report from the account
-- menu; it lands here, and the admin reads it in the dashboard.
--
-- Written from the browser under RLS, so it needs no serverless function of
-- its own (the Hobby plan's limit is nearly used up). The admin reads and
-- sets the status through api/account.ts with the service key: "who is the
-- admin" is known to the server only, not to the database.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  -- Deleting an account deletes its reports with it.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'other' check (kind in ('bug', 'idea', 'other')),
  message text not null check (char_length(btrim(message)) between 1 and 4000),
  -- What the app adds, and shows before sending: build, view, device, theme,
  -- the id of the last error report. Bounded, since the browser writes it.
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object' and char_length(context::text) <= 4000),
  status text not null default 'new' check (status in ('new', 'seen', 'done')),
  created_at timestamptz not null default now()
);

comment on table public.feedback is
  'Reports and ideas sent from the app. Owners insert and read their own; the admin reads all and sets status through the service key.';

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_user_id_idx on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;

-- Supabase grants everything on a new table to anon and authenticated. Only
-- two things are wanted: read your own, and insert the three fields a person
-- fills in. user_id and status come from their defaults and cannot be sent,
-- so nobody can file a report as someone else or mark their own as done.
revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;
grant insert (kind, message, context) on public.feedback to authenticated;

create policy "feedback_select_own"
  on public.feedback for select to authenticated
  using (user_id = (select auth.uid()));

-- At most 20 a day per person: the table is written from the browser, and
-- nothing else bounds how often. Counted in a function because a policy on
-- this table cannot query the table itself (Postgres refuses it as infinite
-- recursion). It answers only for the caller.
create or replace function public.feedback_sent_today()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.feedback f
  where f.user_id = (select auth.uid()) and f.created_at > now() - interval '1 day';
$$;

revoke all on function public.feedback_sent_today() from public, anon;
grant execute on function public.feedback_sent_today() to authenticated;

create policy "feedback_insert_own"
  on public.feedback for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'new'
    and public.feedback_sent_today() < 20
  );

-- No update and no delete policy: a report, once sent, is the admin's to handle.
