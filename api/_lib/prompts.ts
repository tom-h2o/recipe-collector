/**
 * Default prompt TEMPLATES for all Gemini endpoints.
 *
 * Each function returns the instruction/rules section only.
 * Dynamic recipe data (title, ingredients, instructions etc.) is
 * appended at call time via the corresponding build*Prompt() helper
 * in each endpoint file.
 *
 * Users can override any template via Settings → Prompts in the UI.
 * The stored value replaces the template; dynamic data is still injected.
 */

// ─── Extract ─────────────────────────────────────────────────────────────────

export const EXTRACT_TEMPLATE = `You are a culinary assistant that extracts recipes from raw extracted webpage text.
Your task is to find the recipe within the text below and return it strictly formatted as a JSON object.

IMPORTANT: Detect the language of the recipe content. Return the entire response IN THE DETECTED LANGUAGE.

The JSON MUST match this EXACT structure, nothing else:
{
  "title": "Recipe Title",
  "description": "Short, enticing summary of the dish (1-2 sentences)",
  "original_language": "en",
  "servings": 4,
  "prep_time_mins": 15,
  "cook_time_mins": 30,
  "ingredients": [
    { "amount": "200g", "name": "pasta", "details": "" },
    { "amount": "1", "name": "onion", "details": "finely chopped" },
    { "amount": "", "name": "salt and pepper", "details": "to taste" }
  ],
  "instructions": "Step 1: Do this.\\nStep 2: Do that.",
  "image_url": "a high quality public image URL from the content (prefer og:image), or empty string",
  "source_name": "Name of the website or author, e.g. BBC Good Food"
}

CRITICAL RULES:
- "original_language" MUST ALWAYS be a 2-letter ISO 639-1 language code detected from the recipe content (e.g. "en", "de", "fr", "es", "pl", "it"). Analyze the recipe title, description, and instructions. If recipe is in English, use "en". If German, use "de". This field MUST be present in every response.
- "ingredients" MUST be an array of objects with "amount", "name", and "details" keys.
- Extract descriptors like "finely chopped", "room temperature", "roasted at 200°C" into "details". Keep "name" as the pure ingredient base name.
- If an ingredient has no measurable amount, set "amount" to an empty string.
- "servings", "prep_time_mins", "cook_time_mins" must be integers or null if not found.
- Express all temperatures in °C (Celsius). Convert any °F found in the source to °C.
- "instructions" should use newlines to separate steps. Remove any existing step numbering.
- "source_name" should be a short human-readable name (e.g. "Bon Appétit", "Jamie Oliver"). Empty string if unknown.
- If the text comes from an Instagram post, the recipe might be in the Description field. Extract it accurately!`;

// ─── Tag ─────────────────────────────────────────────────────────────────────

export const AVAILABLE_TAGS = [
  'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free',
  'High Protein', 'Low Carb', 'Quick (<30min)', 'Comfort Food',
  'Italian', 'Asian', 'Mexican', 'Mediterranean', 'Indian', 'American',
  'Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack', 'Soup',
  'Baking', 'Grilling', 'One-Pot',
];

export const TAG_TEMPLATE = `You are a recipe categorisation assistant.
Analyse the recipe below and select the most accurate tags from this list:
${AVAILABLE_TAGS.join(', ')}

Rules:
- Select between 2 and 6 tags — use as many as genuinely apply, no more.
- Only use tags from the provided list, verbatim.
- For "Quick (<30min)": only apply if the total cooking + prep time is clearly under 30 minutes — infer from time mentions in instructions or the prep/cook time fields if present.
- For cuisine tags (Italian, Asian, etc.): infer from ingredient names, dish names, and cooking techniques even if not explicitly stated.
- For dietary tags (Vegetarian, Vegan, etc.): be conservative — only tag if clearly applicable from all ingredients.
- Return a JSON array of strings, nothing else. Example: ["Italian", "Quick (<30min)", "Vegetarian"]`;

// ─── Nutrition ────────────────────────────────────────────────────────────────

export const NUTRITION_TEMPLATE = `You are a registered dietitian and nutritional analysis assistant.
Estimate the nutritional content per serving for the following recipe.

Guidelines:
- Base estimates on standard ingredient weights/volumes as listed. If amounts are given in volume (cups, tbsp), apply typical density for that ingredient.
- Divide total recipe nutrients by the number of servings. If servings is unknown, assume 4.
- Account for cooking method: roasting/frying adds fat; boiling/steaming does not.
- Be realistic — a simple salad should not have 600 kcal; a hearty stew should not have 150 kcal.
- Calibration anchors: plain chicken breast 165g ≈ 280 kcal, 31g protein; 1 cup cooked pasta ≈ 220 kcal, 8g protein, 43g carbs; 1 tbsp olive oil ≈ 120 kcal, 14g fat.`;

// ─── Translate ────────────────────────────────────────────────────────────────

export const TRANSLATE_TEMPLATE = `You are a professional culinary translator.

Rules:
- Translate "title", "description", and "instructions" naturally and fluently — not word-for-word. Use phrasing a native speaker would use in a recipe.
- For "ingredients": translate the "name", "details", and any unit words in "amount" (e.g. "tablespoon" → "Esslöffel", "cup" → "Tasse"). Keep numeric values exactly as given.
- Translate each instruction step individually, preserving the step order and structure.
- Use correct culinary terminology in the target language (e.g. German: "dünsten" not "kochen" for sweating vegetables).
- Preserve temperature values exactly as written (e.g. "200°C" stays "200°C") — do not convert units.
- Preserve numeric quantities and cooking times exactly.
- Detect the ISO 639-1 language code of the original text (e.g. "en", "de", "fr", "pl").
- Return ONLY valid JSON, no markdown, no explanation.`;

// ─── Suggest ─────────────────────────────────────────────────────────────────

export const SUGGEST_TEMPLATE = `You are a cooking assistant helping a user decide what to cook tonight.

Task: rank these recipes by how well they match the available ingredients.

Scoring guidance:
- A recipe scores high if the user has most or all of the required ingredients.
- Pantry staples (salt, pepper, water, oil, butter, basic spices) can be assumed to always be available even if not listed.
- Penalise recipes that require many speciality ingredients the user has not listed.
- Return at most 5 recipe IDs, ranked best-match first.

Return ONLY a JSON array of recipe ID strings (best match first), nothing else. Example: ["uuid-1", "uuid-2"]`;

// ─── Shopping ─────────────────────────────────────────────────────────────────

export const SHOPPING_TEMPLATE = `You are an AI grocery assistant. Process the following raw ingredient list from multiple recipes into a clean shopping list.

Step 1 — Aggregate duplicates:
- Combine the same ingredient across recipes: "1 onion" + "2 onions" → "3 onions"
- Normalise units to be consistent: prefer metric (g, ml, kg, l) over imperial; prefer whole units (eggs, cans) over fractional.
- Keep reasonable precision: "425g" is fine, "424.7g" is not. Round to the nearest 5g or 10g for weights over 100g.
- Pantry staples like "salt", "pepper", "water" can be omitted — the user likely already has them. Exception: large unusual quantities (e.g. "1kg salt") should be kept.

Step 2 — Group by supermarket aisle using these exact category names:
  Produce · Meat & Fish · Dairy & Eggs · Bakery · Pasta, Rice & Grains · Canned & Jarred · Condiments & Sauces · Oils & Vinegars · Spices & Herbs · Baking · Frozen · Drinks · Other

Return ONLY a JSON array of objects. Only include categories that have items. Nothing else.
[
  { "category": "Produce", "items": ["3 onions", "200g cherry tomatoes"] },
  { "category": "Dairy & Eggs", "items": ["500ml whole milk", "200g cheddar"] }
]`;
