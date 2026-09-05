-- Move the model tiers onto Google's "-latest" aliases.
--
-- Pinned ids (gemini-3.7-flash and friends) meant a code change and a migration
-- every time Google shipped a release. The aliases follow the current release in
-- each tier on their own. Verified against generateContent before shipping:
--   gemini-flash-latest       -> gemini-3.8-flash
--   gemini-flash-lite-latest  -> gemini-3.5-flash-lite
--   gemini-pro-latest         -> gemini-3.1-pro-preview
--
-- The reason this is safe to rely on is the column added below: every response
-- carries modelVersion, so the concrete model behind an alias is recorded per
-- call and never has to be guessed.
alter table public.gemini_logs
  add column if not exists model_version text;

comment on column public.gemini_logs.model_version is
  'The concrete model Google ran, from the response''s modelVersion field. Differs from "model" when that is an alias such as gemini-flash-latest.';

-- Policy (PR #16): when the default changes, every user moves with it. Rows on
-- the old pinned ids map to the alias for the tier they had chosen, so anyone
-- who deliberately picked Lite or Pro keeps that tier.
update public.settings
set gemini_model = 'gemini-flash-lite-latest'
where gemini_model in ('gemini-3.5-flash-lite', 'gemini-2.5-flash-lite');

update public.settings
set gemini_model = 'gemini-pro-latest'
where gemini_model in ('gemini-3.1-pro-preview', 'gemini-3.0-pro-preview');

-- Everything else, including rows on ids that no longer exist at all, lands on
-- the default tier.
update public.settings
set gemini_model = 'gemini-flash-latest'
where gemini_model not in ('gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest');
