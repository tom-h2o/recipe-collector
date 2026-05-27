-- Add user_id to gemini_logs so each row is scoped to the user who triggered the call
alter table public.gemini_logs
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Drop the old open "any authenticated user reads everything" policy
drop policy if exists "gemini_logs_select" on public.gemini_logs;

-- Authenticated users can only read their own logs
create policy "gemini_logs_select"
  on public.gemini_logs for select
  using (auth.uid() = user_id);
