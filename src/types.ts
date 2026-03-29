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
  user_id?: string | null;
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

export interface AppSettings {
  gemini_model: string;
  gemini_prompt: string;
  active_api_key: 1 | 2;
}

export type ActiveView = 'vault' | 'planner' | 'shopping' | 'public_recipe';
