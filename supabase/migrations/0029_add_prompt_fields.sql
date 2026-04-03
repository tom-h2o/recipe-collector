-- Add per-endpoint prompt fields to settings table
alter table public.settings
  add column gemini_prompt_tag text default '',
  add column gemini_prompt_nutrition text default '',
  add column gemini_prompt_translate text default '',
  add column gemini_prompt_suggest text default '',
  add column gemini_prompt_shopping text default '';
