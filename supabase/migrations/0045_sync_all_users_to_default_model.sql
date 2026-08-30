-- Move every settings row onto the current default model.
--
-- Policy: when DEFAULT_MODEL changes, all users move with it. A user's stored
-- choice only persists until the next default change, so the whole app is
-- always on the model we have chosen and verified.
--
-- Keep this in step with DEFAULT_MODEL in src/lib/constants.ts and
-- api/_lib/supabase.ts. tests/unit/modelDefaults.test.ts fails the build if the
-- constant is changed without a matching migration.

update public.settings
set gemini_model = 'gemini-3.7-flash'
where gemini_model is distinct from 'gemini-3.7-flash';
