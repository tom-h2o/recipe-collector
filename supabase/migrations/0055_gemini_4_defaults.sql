-- Move everyone to the Gemini 4 generation.
--
-- Google replaced the 3.x line with Gemini 4 — hydrogen, carbon, argon — and
-- did NOT move the -latest aliases onto it: gemini-flash-latest still points at
-- the 3.x Flash tier. That tier was returning 503 and timing out when this was
-- written, while gemini-4-hydrogen answered normally, so the aliases are no
-- longer carrying us forward on their own.
--
-- Every id below was verified against generateContent, not ListModels, which
-- advertises both retired models and models a free-tier key cannot call.
--
-- Policy (PR #16): when the default changes, all users move with it.

-- The old Flash tier, and anything on an id that no longer exists, lands on the
-- new default.
update public.settings
set gemini_model = 'gemini-4-hydrogen'
where gemini_model is distinct from 'gemini-flash-lite-latest'
  and gemini_model is distinct from 'gemini-4-carbon';

-- Per-task overrides naming a retired id are dropped so those tasks fall back to
-- the new default. Overrides naming a model that still exists are kept: choosing
-- Lite for the cheap tasks is a real preference, not a casualty of an upgrade.
--
-- Note this does NOT undo the extract->Lite pin applied by hand during the 3.x
-- Flash outage, because Lite is still a valid id. That pin is data rather than
-- policy, and clearing it is left to the owner in Settings.
update public.settings
set task_models = (
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from jsonb_each_text(task_models) AS t(key, value)
   where value in ('gemini-flash-lite-latest', 'gemini-4-hydrogen', 'gemini-4-carbon')
)
where task_models <> '{}'::jsonb;

-- Anything still naming a 3.x id after the filter above is dropped rather than
-- remapped: a task silently running on a retired model is worse than one
-- falling back to the current default.
update public.settings
set task_models = '{}'::jsonb
where task_models is null;
