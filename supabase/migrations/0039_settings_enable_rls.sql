-- Ensure row level security is enabled on public.settings.
-- The table has RLS policies defined (migrations 0003, 0012, 0020) but a
-- Supabase security scan reported RLS itself as disabled — meaning the
-- policies are inert. Re-enable it defensively. No-op if already enabled.
alter table public.settings enable row level security;
