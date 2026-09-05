-- Let each AI job run on its own model.
--
-- The app has one setting for seven very different jobs. Reading a photographed
-- cookbook page is OCR under bad lighting; tagging a recipe whose text is
-- already in hand is near-trivial. A single choice means either paying Flash
-- prices for the easy jobs or losing ingredients on the hard ones.
--
-- Sparse on purpose: a task with no entry falls back to gemini_model, so every
-- existing row keeps behaving exactly as it did and nobody has to visit the new
-- settings section for the app to work.
alter table public.settings
  add column if not exists task_models jsonb not null default '{}'::jsonb;

comment on column public.settings.task_models is
  'Per-task Gemini model overrides keyed by AiTask (extract, tag, nutrition, translate, suggest, scale, shopping). A missing key falls back to gemini_model. See modelFor() in api/_lib/supabase.ts.';

-- Guard the shape rather than the contents: an array or a scalar here would be
-- read as "no overrides" by the app, which hides a mistake instead of surfacing
-- it. Model ids are deliberately not constrained — they change without warning,
-- and a check constraint on them is exactly what broke settings in 0038/0051.
alter table public.settings
  drop constraint if exists settings_task_models_is_object;
alter table public.settings
  add constraint settings_task_models_is_object
  check (jsonb_typeof(task_models) = 'object');
