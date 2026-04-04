# Recipe Vault

A personal recipe manager powered by Google Gemini AI. Save, organise, and cook recipes from anywhere — import from a URL, snap a photo, or type them in manually.

---

## Core Features

### Recipe Vault
- Browse your recipe collection in a card grid with search, tag filters, and sort options
- Infinite scroll with pagination (24 recipes per page)
- Mark recipes as favourites
- View full recipe details in a drawer: ingredients, instructions, nutrition, tags, and notes

### AI-Powered Import
- **URL extraction** — paste any recipe URL and Gemini scrapes and structures it automatically
- **Photo extraction** — upload or snap a photo of a recipe and Gemini reads it
- Magic wand animation while AI is processing

### AI Enhancements (automatic on every new recipe)
- **Tagging** — categorises recipes into cuisine, dietary, and meal-type tags
- **Nutrition estimates** — calories, protein, carbs, fat, and fibre per serving
- **Image finding** — locates a suitable image if none was provided

### Translation
- Translate any recipe into English, German, French, Spanish, or Polish with one click
- Translations are cached — switching languages is instant after the first time
- Unit words in ingredient amounts are translated (e.g. "tablespoon" → "Esslöffel")
- Translated content is used throughout: detail view, cook mode, and meal planner

### Recipe Scaling
- Adjust serving count with +/− buttons (math scaling)
- **AI Scale** — asks Gemini to round quantities naturally for the new serving size
- Save a scaled version as a separate recipe

### Cook Mode
- Fullscreen step-by-step mode, one instruction at a time
- Ingredient side panel with tap-to-check-off
- Fully translated when a preferred language is active

### Meal Planner
- 7-day calendar with Breakfast, Lunch, Dinner, and Snack slots
- Drag and drop recipes into slots (desktop) or tap to add (mobile)
- Daily calorie totals calculated from nutrition data

### Shopping List
- Generate a shopping list from selected meal plan recipes via AI
- Ingredients are aggregated, deduped, and grouped by supermarket aisle
- Manual pantry item management

### Recipe Sharing
- Send any recipe to another user by email address
- Recipient sees it in their Inbox and can accept or decline
- Accepting copies the full recipe (including all translations) into their vault
- Known contacts are autocompleted from previous shares

### Settings & Customisation
- Choose between Gemini models (e.g. gemini-2.5-flash)
- Customise the AI prompt for each function: extraction, tagging, nutrition, translation, suggestion, shopping
- Switch between two Gemini API keys
- Toggle temperature display between °C and °F

### Suggest Recipes
- Tell the AI what ingredients you have and it ranks your existing recipes by how well they match

---

## Technical Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Backend | Vercel Serverless Functions (`/api/`) |
| Database | Supabase (Postgres + Row Level Security) |
| AI | Google Gemini via `@google/genai` |
| Auth | Supabase Auth (password, magic link, password recovery) |

---

*Designed by Magical Apps · Thomas Holder*
