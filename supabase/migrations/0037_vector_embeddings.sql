-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to recipes table
-- text-embedding-004 produces 768 dimensions
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create a function to search recipes by embedding similarity
CREATE OR REPLACE FUNCTION match_recipes(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_user_id uuid
)
RETURNS TABLE (
  id uuid,
  title varchar,
  description text,
  ingredients jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    recipes.id,
    recipes.title,
    recipes.description,
    recipes.ingredients,
    1 - (recipes.embedding <=> query_embedding) AS similarity
  FROM recipes
  WHERE (recipes.user_id = filter_user_id OR recipes.user_id IS NULL)
    AND recipes.embedding IS NOT NULL
    AND 1 - (recipes.embedding <=> query_embedding) > match_threshold
  ORDER BY recipes.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
