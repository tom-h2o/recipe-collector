-- Claude becomes the main AI provider; Gemini stays as the automatic backup.
--
-- Since 0068 the global row (id = 1) is the only place the models are read
-- from, so this one row decides what every user's AI calls run on. Each Claude
-- model falls back to a Gemini one inside the same call when Claude fails for
-- any reason (withModelFallback in api/_lib/gemini.ts): Haiku to Gemini Lite,
-- Sonnet and Opus to Gemini Standard. That includes no Claude key at all, so
-- this migration is safe to apply before ANTHROPIC_API_KEY is set: every task
-- keeps running on Gemini until it is.
--
-- The assignment, from AI_TASKS in src/lib/constants.ts:
--   Sonnet: extraction (photos, PDFs, web pages), translation, nutrition
--   Haiku:  tagging, suggestions, scaling, the shopping list
-- Sonnet is also the main model, for any task added later without an entry.
--
-- Embeddings are not in this row and do not change: Anthropic has no
-- embedding model, so recipes.embedding stays on gemini-embedding-2.
--
-- The column keeps its name, gemini_model, although it now holds a Claude id:
-- renaming it would break any older build still open in a browser, which
-- selects it by name.

update public.settings
   set gemini_model = 'claude-sonnet-5-5',
       task_models = '{
         "extract":   "claude-sonnet-5-5",
         "translate": "claude-sonnet-5-5",
         "suggest":   "claude-haiku-5-5",
         "tag":       "claude-haiku-5-5",
         "nutrition": "claude-sonnet-5-5",
         "scale":     "claude-haiku-5-5",
         "shopping":  "claude-haiku-5-5"
       }'::jsonb
 where id = 1;

comment on column public.settings.gemini_model is
  'Main AI model, Claude or Gemini despite the name. Read from the global row (id = 1) only; per-user values are ignored since migration 0068. Set by the admin.';
