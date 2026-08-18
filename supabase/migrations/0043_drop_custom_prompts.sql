-- Remove the per-user custom prompt feature.
--
-- Prompts now live only in api/_lib/prompts.ts. The override columns pinned each
-- user to whatever prompt text was current when they last saved settings, so
-- later prompt fixes (e.g. the "write the recipe in its source language" rule)
-- never reached them. Migrations 0032-0034 only patched `where id = 1`, so
-- per-user rows drifted permanently.
--
-- Dropping these columns is irreversible; the prompt text they held is
-- reproduced in git history (api/_lib/prompts.ts) and in migrations 0032-0034.

alter table public.settings
  drop column if exists gemini_prompt,
  drop column if exists gemini_prompt_tag,
  drop column if exists gemini_prompt_nutrition,
  drop column if exists gemini_prompt_translate,
  drop column if exists gemini_prompt_suggest,
  drop column if exists gemini_prompt_shopping;
