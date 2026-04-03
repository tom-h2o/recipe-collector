export interface Nutrition {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface Ingredient {
  amount: string;
  name: string;
  details?: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  ingredients: Ingredient[] | string[];
  instructions: string;
  image_url: string;
  servings: number | null;
  created_at: string;
  tags: string[];
  is_favourite: boolean;
  nutrition: Nutrition | null;
  rating: number | null;
  notes: string | null;
  prep_time_mins: number | null;
  cook_time_mins: number | null;
  source_url: string | null;
  source_name: string | null;
  original_servings?: number | null;
  original_language?: string | null;
  preferred_language?: string | null;
  user_id?: string | null;
}

export interface RecipeTranslation {
  id?: string;
  recipe_id: string;
  language_code: string;
  title: string;
  description: string | null;
  instructions: string;
  ingredients: Ingredient[];
  created_at?: string;
  cached?: boolean;
}

export interface MealPlan {
  id: string;
  date: string;
  recipe_id: string;
  meal_type: string;
  recipe?: Recipe;
}

export interface ShoppingItem {
  id: string;
  item: string;
  category: string | null;
  is_checked: boolean;
}

export interface PantryItem {
  id: string;
  item: string;
  category: string | null;
  created_at: string;
}

export interface AppSettings {
  gemini_model: string;
  gemini_prompt: string;
  gemini_prompt_tag: string;
  gemini_prompt_nutrition: string;
  gemini_prompt_translate: string;
  gemini_prompt_suggest: string;
  gemini_prompt_shopping: string;
  active_api_key: 1 | 2;
  temperature_unit: 'C' | 'F';
}

export type ActiveView = 'vault' | 'planner' | 'shopping' | 'inbox' | 'public_recipe';

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface RecipeCollection {
  collection_id: string;
  recipe_id: string;
}

export interface RecipeShare {
  id: string;
  recipe_id: string;
  recipe_title: string;
  recipe_description: string | null;
  recipe_image_url: string | null;
  sender_id: string;
  sender_email: string;
  recipient_email: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  contact_email: string;
  created_at: string;
}
