export const MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'] as const;

export const FILTERS = [
  '⭐ Favourites',
  'Quick (<30min)',
  'Vegetarian',
  'Vegan',
  'High Protein',
  'Comfort Food',
  'Breakfast',
  'Dessert',
] as const;

export const AVAILABLE_TAGS = [
  'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free',
  'High Protein', 'Low Carb', 'Quick (<30min)', 'Comfort Food',
  'Italian', 'Asian', 'Mexican', 'Mediterranean', 'Indian', 'American',
  'Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack', 'Soup',
  'Baking', 'Grilling', 'One-Pot',
] as const;

export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;

export const PAGE_SIZE = 24;

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'pl', label: 'Polski', flag: '🇵🇱' },
] as const;

export type LanguageCode = typeof LANGUAGES[number]['code'];

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'a-z', label: 'A → Z' },
  { value: 'z-a', label: 'Z → A' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'favourites', label: 'Favourites first' },
] as const;

export type SortOption = typeof SORT_OPTIONS[number]['value'];

export const DEFAULT_PROMPT = `You are a culinary assistant that extracts recipes from raw extracted webpage text.
Your task is to find the recipe within the text below and return it strictly formatted as a JSON object.

The JSON MUST match this EXACT structure, nothing else:
{
  "title": "Recipe Title",
  "description": "Short, enticing summary of the dish (1-2 sentences)",
  "servings": 4,
  "prep_time_mins": 15,
  "cook_time_mins": 30,
  "ingredients": [
    { "amount": "200g", "name": "pasta", "details": "" },
    { "amount": "1", "name": "onion", "details": "finely chopped" },
    { "amount": "", "name": "salt and pepper", "details": "to taste" }
  ],
  "instructions": "Step 1: Do this.\\nStep 2: Do that.",
  "image_url": "a high quality public image URL from the content (prefer og:image), or empty string"
}

CRITICAL RULES:
- "ingredients" MUST be an array of objects with "amount", "name", and an optional "details" key.
- Extract descriptive text like "finely chopped" or "sliced" into "details", leaving ONLY the pure ingredient base in "name".
- If an ingredient has no measurable amount, set "amount" to an empty string.
- "servings" must be an integer number or null if not found.
- "prep_time_mins" and "cook_time_mins" must be integers (minutes) or null if not found.
- "instructions" should use newlines to separate steps, remove any existing numbering.
- If the text comes from an Instagram post, the recipe might be in the Description field. Extract it accurately!`;
