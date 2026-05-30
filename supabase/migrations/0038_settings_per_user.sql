-- Give the settings id column a proper sequence so per-user rows get distinct
-- IDs and don't collide with the global fallback row (id = 1).
-- The id = 1 row (user_id IS NULL) is kept as a read-only fallback for any
-- API request where no user-specific row exists yet.
create sequence if not exists settings_id_seq start with 2;
alter table public.settings alter column id set default nextval('settings_id_seq');
