-- Move anyone sitting on the Lite tier off an id the API does not serve.
--
-- MODEL_OPTIONS offered 'gemini-flash-lite-latest'. That is not a model Google
-- serves: it does not appear in their model list at all, so every call on this
-- tier failed. The alias was presumably correct once; PR #43 moved Standard and
-- Frontier onto the Gemini 4 family and left this one behind, which is exactly
-- the trap CLAUDE.md already records -- aliases track releases *within* a tier
-- but do not carry across a generation.
--
-- There is no Gemini 4 lite model to move to. The family is hydrogen, argon,
-- carbon and neon; argon is a reasoning model, cheaper per turn than carbon but
-- nothing like a flash-lite. The cheapest model Google still serves is
-- gemini-3.5-flash-lite, which is pinned rather than aliased for the reason
-- above.
--
-- Two places can hold the dead id: settings.gemini_model, and any task in the
-- settings.task_models map. Both are rewritten here; a user who never chose
-- Lite is untouched.

update public.settings
   set gemini_model = 'gemini-3.5-flash-lite'
 where gemini_model = 'gemini-flash-lite-latest';

update public.settings
   set task_models = (
     select jsonb_object_agg(
       key,
       case when value = '"gemini-flash-lite-latest"'::jsonb
            then '"gemini-3.5-flash-lite"'::jsonb
            else value
       end
     )
     from jsonb_each(task_models)
   )
 where task_models is not null
   and task_models::text like '%gemini-flash-lite-latest%';
