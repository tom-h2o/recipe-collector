-- Migration: Normalize ingredients polymorphic column
-- Converts any legacy string[] formats to structured Ingredient[] objects: { amount: "", name: "ingredient string", details: "" }

-- 1. Perform transformation on all records where ingredients is an array of strings
UPDATE recipes
SET ingredients = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'amount', '',
      'name', elem,
      'details', ''
    )
  )
  FROM jsonb_array_elements_text(ingredients) AS elem
)
WHERE jsonb_typeof(ingredients) = 'array'
  AND jsonb_typeof(ingredients->0) = 'string';

-- 2. Add a constraint to guarantee ingredients remains an array of objects
-- and each object contains 'name' and 'amount' keys.
ALTER TABLE recipes
ADD CONSTRAINT chk_ingredients_format
CHECK (
  jsonb_typeof(ingredients) = 'array'
  AND (
    jsonb_array_length(ingredients) = 0
    OR (
      jsonb_typeof(ingredients->0) = 'object'
      AND (ingredients->0) ? 'name'
      AND (ingredients->0) ? 'amount'
    )
  )
);
