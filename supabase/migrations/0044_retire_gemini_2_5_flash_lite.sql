-- Repair users pinned to a model Google has retired.
--
-- generateContent for models/gemini-2.5-flash-lite now returns:
--   404 "This model models/gemini-2.5-flash-lite is no longer available to new
--   users. Please update your code to use models/gemini-3.5-flash-lite"
--
-- It is still listed by ListModels, so it looked valid, but every AI call from
-- an affected account fails. Move them to the replacement Google names.

update public.settings
set gemini_model = 'gemini-3.5-flash-lite'
where gemini_model = 'gemini-2.5-flash-lite';
