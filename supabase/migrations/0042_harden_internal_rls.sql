-- Tighten policies for internal tables that are only meant to be accessed
-- through service-role API routes, plus user-scoped translation/log reads.

DO $$
BEGIN
  IF to_regclass('public.url_cache') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Service role full access to url_cache" ON public.url_cache;
    CREATE POLICY "Service role full access to url_cache"
      ON public.url_cache FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DROP POLICY IF EXISTS "ai_cache_service_all" ON public.ai_cache;

CREATE POLICY "ai_cache_service_all"
  ON public.ai_cache FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "translations_select" ON public.recipe_translations;

CREATE POLICY "translations_select"
  ON public.recipe_translations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recipes r
      WHERE r.id = recipe_translations.recipe_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "gemini_logs_insert" ON public.gemini_logs;

CREATE POLICY "gemini_logs_insert"
  ON public.gemini_logs FOR INSERT
  TO service_role
  WITH CHECK (true);
