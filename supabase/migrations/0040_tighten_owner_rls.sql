-- Remove transitional access to legacy rows without an owner.
-- If this migration fails, first assign those rows to the intended user or archive them.

DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM (
    SELECT id FROM public.recipes WHERE user_id IS NULL
    UNION ALL
    SELECT id FROM public.meal_plan WHERE user_id IS NULL
    UNION ALL
    SELECT id FROM public.shopping_list WHERE user_id IS NULL
  ) orphaned_rows;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Refusing to tighten RLS: % recipes/meal_plan/shopping_list rows still have user_id IS NULL', orphan_count;
  END IF;
END $$;

DROP POLICY IF EXISTS "recipes_select" ON public.recipes;
DROP POLICY IF EXISTS "recipes_update" ON public.recipes;
DROP POLICY IF EXISTS "recipes_delete" ON public.recipes;

CREATE POLICY "recipes_select"
  ON public.recipes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "recipes_update"
  ON public.recipes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "recipes_delete"
  ON public.recipes FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "meal_plan_select" ON public.meal_plan;
DROP POLICY IF EXISTS "meal_plan_update" ON public.meal_plan;
DROP POLICY IF EXISTS "meal_plan_delete" ON public.meal_plan;

CREATE POLICY "meal_plan_select"
  ON public.meal_plan FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "meal_plan_update"
  ON public.meal_plan FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "meal_plan_delete"
  ON public.meal_plan FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "shopping_list_select" ON public.shopping_list;
DROP POLICY IF EXISTS "shopping_list_update" ON public.shopping_list;
DROP POLICY IF EXISTS "shopping_list_delete" ON public.shopping_list;

CREATE POLICY "shopping_list_select"
  ON public.shopping_list FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "shopping_list_update"
  ON public.shopping_list FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "shopping_list_delete"
  ON public.shopping_list FOR DELETE
  USING (auth.uid() = user_id);
