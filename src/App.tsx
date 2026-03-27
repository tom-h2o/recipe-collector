import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ChefHat, Users, Settings, Pencil, Trash2, Search, X, Star, Minus, Flame, Wand2, ShoppingCart, Share2, Printer } from "lucide-react";
import { Toaster, toast } from "sonner";

const DEFAULT_PROMPT = `You are a culinary assistant that extracts recipes from raw extracted webpage text.
Your task is to find the recipe within the text below and return it strictly formatted as a JSON object.

The JSON MUST match this EXACT structure, nothing else:
{
  "title": "Recipe Title",
  "description": "Short, enticing summary of the dish (1-2 sentences)",
  "servings": 4,
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
- "instructions" should use newlines to separate steps, remove any existing numbering.
- If the text comes from an Instagram post, the recipe might be in the Description field. Extract it accurately!`;

const MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'];

interface Nutrition { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; }
interface Ingredient { amount: string; name: string; details?: string; }
interface Recipe {
  id: string; title: string; description: string;
  ingredients: Ingredient[] | string[]; instructions: string;
  image_url: string; servings: number | null; created_at: string;
  tags: string[]; is_favourite: boolean; nutrition: Nutrition | null;
  rating: number | null; notes: string | null;
}

function parseIngredients(raw: Ingredient[] | string[]): Ingredient[] {
  if (!raw || raw.length === 0) return [];
  if (typeof raw[0] === "object" && "name" in raw[0]) return raw as Ingredient[];
  return (raw as string[]).map(s => {
    const match = s.match(/^([\d\/\.\s]*(tbsp|tsp|cups?|g|kg|ml|l|oz|lb|cloves?|bunch|slices?|pinch|handful|pieces?|whole|large|medium|small|cans?)?[\s]*)/i);
    const amount = match ? match[0].trim() : "";
    let rest = amount ? s.replace(amount, "").trim() : s;
    let name = rest;
    let details = "";
    if (rest.includes(',')) {
       const parts = rest.split(',');
       name = parts[0].trim();
       details = parts.slice(1).join(',').trim();
    }
    return { amount, name, details };
  });
}

function recipeToIngredientText(ingredients: Ingredient[] | string[]): string {
  const parsed = parseIngredients(ingredients);
  return parsed.map(i => `${i.amount} ${i.name}${i.details ? `, ${i.details}` : ''}`.trim()).join("\n");
}

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [scaledServings, setScaledServings] = useState<number>(1);

  // When a recipe is opened, initialise scaled servings to the base
  function openRecipe(r: Recipe) { setSelectedRecipe(r); setScaledServings(r.servings || 1); }
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCookMode, setIsCookMode] = useState(false);
  const [cookStep, setCookStep] = useState(0);

  // Meal Planner state
  const [activeView, setActiveView] = useState<"vault" | "planner" | "shopping" | "public_recipe">("vault");
  interface MealPlan { id: string; date: string; recipe_id: string; meal_type: string; recipe?: Recipe }
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  interface ShoppingItem { id: string; item: string; category: string | null; is_checked: boolean }
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [isGeneratingShopping, setIsGeneratingShopping] = useState(false);
  const [publicRecipe, setPublicRecipe] = useState<Recipe | null>(null);

  // Suggest state
  const [isSuggestModalOpen, setIsSuggestModalOpen] = useState(false);
  const [suggestIngredients, setSuggestIngredients] = useState("");
  const [suggestedRecipes, setSuggestedRecipes] = useState<Recipe[] | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const FILTERS = ["⭐ Favourites", "Quick (<30min)", "Vegetarian", "Vegan", "High Protein", "Comfort Food", "Breakfast", "Dessert"];

  const filteredRecipes = useMemo(() => {
    let result = recipes;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.title?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        parseIngredients(r.ingredients).some(i => i.name.toLowerCase().includes(q))
      );
    }
    if (activeFilter === "⭐ Favourites") {
      result = result.filter(r => r.is_favourite);
    } else if (activeFilter) {
      result = result.filter(r => r.tags?.includes(activeFilter));
    }
    return result;
  }, [recipes, searchQuery, activeFilter]);

  // URL Extraction
  const [extractUrl, setExtractUrl] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [instructions, setInstructions] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [servings, setServings] = useState("");

  const [settingsModel, setSettingsModel] = useState('gemini-2.5-flash');
  const [settingsPrompt, setSettingsPrompt] = useState(DEFAULT_PROMPT);
  const [activeApiKey, setActiveApiKey] = useState<1 | 2>(1);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("recipes").select("*").order("created_at", { ascending: false });
    if (data) setRecipes(data);
    setLoading(false);
  }, []);

  const fetchMealPlans = useCallback(async () => {
    const { data } = await supabase.from("meal_plan").select("*, recipe:recipes(*)").order("date", { ascending: true });
    if (data) setMealPlans(data as MealPlan[]);
  }, []);

  const fetchShoppingList = useCallback(async () => {
    const { data } = await supabase.from("shopping_list").select("*").order("category", { ascending: true });
    if (data) setShoppingList(data as ShoppingItem[]);
  }, []);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from("settings").select("gemini_model, gemini_prompt, active_api_key").eq("id", 1).single();
    if (data) {
      if (data.gemini_model) setSettingsModel(data.gemini_model);
      if (data.gemini_prompt) setSettingsPrompt(data.gemini_prompt);
      if (data.active_api_key) setActiveApiKey(data.active_api_key as 1 | 2);
    }
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/recipe/")) {
      const id = path.split("/recipe/")[1];
      if (id) {
        setLoading(true);
        supabase.from("recipes").select("*").eq("id", id).single().then(({ data }) => {
          if (data) {
            setPublicRecipe(data);
            setActiveView("public_recipe");
          }
          setLoading(false);
        });
      }
    } else {
      fetchRecipes(); fetchMealPlans(); fetchShoppingList(); fetchSettings();
    }
  }, [fetchRecipes, fetchMealPlans, fetchShoppingList, fetchSettings]);

  function openForm(recipe?: Recipe) {
    if (recipe) {
      setEditingRecipe(recipe);
      setTitle(recipe.title);
      setDescription(recipe.description || "");
      setIngredients(recipeToIngredientText(recipe.ingredients));
      setInstructions(recipe.instructions || "");
      setImageUrl(recipe.image_url || "");
      setServings(recipe.servings ? String(recipe.servings) : "");
    } else {
      setEditingRecipe(null);
      setTitle(""); setDescription(""); setIngredients(""); setInstructions(""); setImageUrl(""); setServings(""); setExtractUrl("");
    }
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingRecipe(null);
    setExtractUrl("");
    setTitle(""); setDescription(""); setIngredients(""); setInstructions(""); setImageUrl(""); setServings("");
  }

  async function handleExtract(e: React.MouseEvent) {
    e.preventDefault();
    if (!extractUrl) return;
    setIsExtracting(true);
    const id = toast.loading("Extracting recipe with Gemini AI...");
    try {
      const res = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: extractUrl }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract recipe');
      setTitle(data.title || ""); setDescription(data.description || "");
      setServings(data.servings ? String(data.servings) : ""); setImageUrl(data.image_url || ""); setInstructions(data.instructions || "");
      if (Array.isArray(data.ingredients)) {
        if (data.ingredients.length > 0 && typeof data.ingredients[0] === "object") {
          setIngredients((data.ingredients as Ingredient[]).map(i => `${i.amount} ${i.name}`.trim()).join("\n"));
        } else { setIngredients((data.ingredients as string[]).join("\n")); }
      }
      toast.success("Recipe auto-filled! Review the details below.", { id });
    } catch (err: any) {
      toast.error(err.message || "Couldn't extract recipe.", { id });
    } finally { setIsExtracting(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    const ingredientsList = ingredients.split("\n").map(line => {
      const l = line.trim();
      const match = l.match(/^([\d\/\.\s]*(tbsp|tsp|cups?|g|kg|ml|l|oz|lb|cloves?|bunch|slices?|pinch|handful|pieces?|whole|large|medium|small|cans?)?[\s]*)/i);
      const amount = match ? match[0].trim() : "";
      return { amount, name: amount ? l.replace(amount, "").trim() : l };
    }).filter(i => i.name);

    const payload = {
      title, description, ingredients: ingredientsList, instructions,
      image_url: imageUrl || "https://images.unsplash.com/photo-1495521821757-a1efb6729352?q=80&w=600&auto=format&fit=crop",
      servings: servings ? parseInt(servings) : null,
    };

    let error;
    if (editingRecipe) {
      ({ error } = await supabase.from("recipes").update(payload).eq("id", editingRecipe.id));
    } else {
      ({ error } = await supabase.from("recipes").insert([payload]));
    }

    if (!error) {
      closeForm();
      fetchRecipes();
      toast.success(editingRecipe ? "Recipe updated! ✏️" : "Recipe saved! 🍽️");
      // Fire-and-forget auto-tagging for new recipes
      if (!editingRecipe) {
        // Get the newly inserted recipe id to tag it
        const { data: newRow } = await supabase.from("recipes").select("id").order("created_at", { ascending: false }).limit(1).single();
        if (newRow?.id) {
          // Tag and Nutrition in parallel
          fetch('/api/tag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipeId: newRow.id, title, description, ingredients: ingredientsList, instructions }) }).catch(console.warn);
          fetch('/api/nutrition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipeId: newRow.id, title, ingredients: ingredientsList, servings: servings ? parseInt(servings) : null }) })
            .then(() => fetchRecipes()).catch(console.warn);
        }
      }
    } else {
      toast.error("Failed to save: " + (error.message || "Check Supabase credentials/schema."));
    }
    setIsSaving(false);
  }

  async function toggleFavourite(recipe: Recipe, e: React.MouseEvent) {
    e.stopPropagation();
    const { error } = await supabase.from("recipes").update({ is_favourite: !recipe.is_favourite }).eq("id", recipe.id);
    if (!error) fetchRecipes();
    else toast.error("Failed to update favourite.");
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("recipes").delete().eq("id", deleteTarget.id);
    if (!error) {
      setDeleteTarget(null);
      setSelectedRecipe(null);
      fetchRecipes();
      toast.success("Recipe deleted.");
    } else {
      toast.error("Failed to delete recipe.");
    }
  }

  async function handleSaveSettings() {
    setIsSavingSettings(true);
    const payload = { 
      id: 1, 
      gemini_model: settingsModel, 
      gemini_prompt: settingsPrompt,
      active_api_key: activeApiKey
    };
    const { error } = await supabase.from("settings").upsert(payload);
    if (!error) { toast.success("Settings saved!"); setIsSettingsOpen(false); }
    else { toast.error("Failed to save settings: " + error.message); }
    setIsSavingSettings(false);
  }

  async function handleSuggest(e: React.FormEvent) {
    e.preventDefault();
    if (!suggestIngredients.trim()) return;
    setIsSuggesting(true);
    const id = toast.loading("Finding matches with Gemini AI...");
    try {
      const ingredientsList = suggestIngredients.split(",").map(s => s.trim()).filter(Boolean);
      const res = await fetch('/api/suggest', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ ingredients: ingredientsList }) 
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to suggest recipes');
      setSuggestedRecipes(data.suggestions || []);
      toast.success("Found some delicious matches!", { id });
    } catch (err: any) {
      toast.error(err.message || "Couldn't suggest recipes.", { id });
    } finally { setIsSuggesting(false); }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 sm:p-10 font-sans print:p-0 print:bg-white text-zinc-900 dark:text-zinc-50">
      <Toaster richColors position="top-right" className="print:hidden" />

      {activeView === "public_recipe" && publicRecipe ? (
        <div className="max-w-3xl mx-auto bg-white dark:bg-zinc-950 md:shadow-2xl rounded-3xl overflow-hidden print:shadow-none print:w-full border border-zinc-200 dark:border-zinc-800 break-inside-avoid">
           {(publicRecipe as any).image_url && <img src={(publicRecipe as any).image_url} className="w-full h-64 md:h-96 object-cover" />}
           <div className="p-8 md:p-12 space-y-8">
             <div className="flex justify-between items-start">
               <div>
                 <h1 className="text-4xl md:text-5xl font-black mb-4">{publicRecipe.title}</h1>
                 {publicRecipe.description && <p className="text-lg text-zinc-600 dark:text-zinc-400">{publicRecipe.description}</p>}
               </div>
               <button onClick={() => window.print()} className="print:hidden p-3 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 transition text-zinc-600 dark:text-zinc-300"><Printer className="w-5 h-5"/></button>
             </div>
             
             {publicRecipe.servings && <div className="inline-flex items-center gap-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-4 py-2 rounded-full font-bold"><Users className="w-4 h-4"/> Serves {publicRecipe.servings}</div>}
             
             <div className="grid md:grid-cols-2 gap-12">
               <div>
                 <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 border-b pb-2"><ChefHat className="text-orange-500 w-6 h-6"/> Ingredients</h2>
                 <ul className="space-y-3">
                   {parseIngredients(publicRecipe.ingredients).map((i, idx) => (
                     <li key={idx} className="flex items-start gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                       <div className="w-2 h-2 mt-2 rounded-full bg-orange-400 shrink-0"/> 
                       {i.amount && <span className="font-bold text-orange-600 dark:text-orange-400">{i.amount}</span>} 
                       <span className="text-zinc-800 dark:text-zinc-200">{i.name}{i.details ? <span className="text-zinc-500 dark:text-zinc-400">, {i.details}</span> : ""}</span>
                     </li>
                   ))}
                 </ul>
               </div>
               <div>
                 <h2 className="text-2xl font-bold mb-4 border-b pb-2">Instructions</h2>
                 <ol className="space-y-6 list-decimal list-outside ml-5">
                   {publicRecipe.instructions.split(/\n+/).filter(Boolean).map((step: string, idx: number) => (
                     <li key={idx} className="text-zinc-700 dark:text-zinc-300 pl-2 leading-relaxed font-medium">{step}</li>
                   ))}
                 </ol>
               </div>
             </div>
           </div>
        </div>
      ) : (
      <>
      {/* Header */}
      <div className="max-w-6xl mx-auto space-y-8 print:hidden">
        <header className="relative flex items-center justify-between border-b pb-6 border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3 text-zinc-900 dark:text-zinc-50">
            <ChefHat className="w-8 h-8 md:w-10 md:h-10 text-orange-500" />
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight">Recipe Vault</h1>
          </div>
          <div className="hidden lg:flex bg-zinc-200/50 dark:bg-zinc-800/50 rounded-full p-1 absolute left-1/2 -translate-x-1/2">
            <button onClick={() => setActiveView("vault")} className={`px-5 py-1.5 rounded-full text-sm font-bold transition-all ${activeView === "vault" ? "bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}>Vault</button>
            <button onClick={() => setActiveView("planner")} className={`px-5 py-1.5 rounded-full text-sm font-bold transition-all ${activeView === "planner" ? "bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}>Meal Planner</button>
            <button onClick={() => setActiveView("shopping")} className={`px-5 py-1.5 rounded-full text-sm font-bold transition-all ${activeView === "shopping" ? "bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}>Shopping List</button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSuggestModalOpen(true)} className="inline-flex items-center justify-center gap-2 bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 dark:text-purple-300 font-bold rounded-full px-5 shadow-sm transition-transform hover:scale-105 h-10 text-sm border border-purple-200 dark:border-purple-800/50">
              <Wand2 className="w-4 h-4" /> Suggest
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" title="Settings">
              <Settings className="w-5 h-5" />
            </button>
            <button onClick={() => openForm()} className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-full px-6 shadow-md transition-transform hover:scale-105 h-10 text-sm">
              <Plus className="w-4 h-4" /> Add Recipe
            </button>
          </div>
        </header>

        {activeView === "vault" ? (
          <>
            {/* Search & Filter */}
            <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search recipes, ingredients..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/60 transition shadow-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setActiveFilter(activeFilter === f ? null : f)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  activeFilter === f
                    ? "bg-orange-500 border-orange-500 text-white shadow"
                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-600"
                }`}
              >{f}</button>
            ))}
            {(searchQuery || activeFilter) && (
              <button onClick={() => { setSearchQuery(""); setActiveFilter(null); }} className="px-3 py-1 rounded-full text-xs font-semibold border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:text-red-500 hover:border-red-400 transition-all flex items-center gap-1">
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>
        </div>

        {/* Recipe Grid */}
        <main>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => <Card key={i} className="animate-pulse h-[400px] bg-zinc-200 dark:bg-zinc-800 rounded-xl border-none" />)}
            </div>
          ) : recipes.length === 0 ? (
            <div className="text-center py-32 bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-800">
              <ChefHat className="w-20 h-20 mx-auto mb-6 text-zinc-300 dark:text-zinc-700" />
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">No recipes yet</p>
              <p className="text-zinc-500 dark:text-zinc-400">Click "Add Recipe" to get started!</p>
            </div>
          ) : filteredRecipes.length === 0 ? (
            <div className="text-center py-24 bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-800">
              <Search className="w-16 h-16 mx-auto mb-4 text-zinc-300 dark:text-zinc-700" />
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">No results found</p>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">Try a different search term or clear the filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredRecipes.map(recipe => {
                const parsed = parseIngredients(recipe.ingredients);
                return (
                  <Card key={recipe.id} onClick={() => openRecipe(recipe)} className="cursor-pointer overflow-hidden flex flex-col group hover:shadow-2xl transition-all duration-300 border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl">
                    <div className="aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 relative">
                      <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
                        <span className="text-white text-sm font-semibold px-4 py-1.5 rounded-full border border-white/30 bg-white/20 backdrop-blur-sm">View Recipe</span>
                      </div>
                      <button onClick={(e) => toggleFavourite(recipe, e)} className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm shadow transition-transform hover:scale-110" title={recipe.is_favourite ? "Unfavourite" : "Favourite"}>
                        <Star className={`w-4 h-4 ${recipe.is_favourite ? "fill-yellow-400 text-yellow-400" : "text-zinc-400"}`} />
                      </button>
                    </div>
                    <CardHeader className="pt-5">
                      <CardTitle className="line-clamp-1 text-xl font-bold">{recipe.title}</CardTitle>
                      <CardDescription className="line-clamp-2 mt-1 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{recipe.description || "No description provided."}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 pb-3">
                      <h4 className="font-bold text-xs uppercase tracking-wider mb-3 text-zinc-400">{parsed.length} Ingredient{parsed.length !== 1 ? "s" : ""}</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {parsed.slice(0, 5).map((ing, i) => (
                          <span key={i} className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800/80 text-xs font-medium rounded-md text-zinc-700 dark:text-zinc-300 max-w-[140px] truncate">{ing.name}</span>
                        ))}
                        {parsed.length > 5 && <span className="px-2.5 py-1 bg-orange-50 dark:bg-orange-900/20 text-xs font-medium rounded-md text-orange-600 dark:text-orange-400">+{parsed.length - 5} more</span>}
                      </div>
                      {recipe.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                          {recipe.tags.map(tag => (
                            <span key={tag} onClick={(e) => { e.stopPropagation(); setActiveFilter(activeFilter === tag ? null : tag); }}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer transition-all ${
                                activeFilter === tag ? "bg-orange-500 border-orange-500 text-white" : "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/50 text-orange-600 dark:text-orange-400 hover:bg-orange-100"
                              }`}>{tag}</span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="border-t border-zinc-100 dark:border-zinc-800/50 py-3 bg-zinc-50/50 dark:bg-zinc-900/50 flex justify-between items-center">
                      {recipe.servings ? <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500"><Users className="w-3.5 h-3.5" /> Serves {recipe.servings}</span> : <span />}
                      <p className="text-xs font-semibold text-zinc-400">{new Date(recipe.created_at).toLocaleDateString()}</p>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
        </>
        ) : activeView === "planner" ? (
          <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in duration-500">
            <div className="w-full lg:w-1/3 xl:w-1/4 space-y-4">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"><ChefHat className="w-5 h-5 text-orange-500"/> Draggable Recipes</h2>
              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2 pb-4">
                {recipes.map(r => (
                   <div key={r.id} draggable onDragStart={(e) => { e.dataTransfer.setData("recipe_id", r.id); e.dataTransfer.effectAllowed = "copy"; }} className="p-3 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 cursor-grab active:cursor-grabbing hover:border-orange-300 dark:hover:border-orange-700 transition-colors flex gap-3 group">
                     {r.image_url && <img src={r.image_url} className="w-12 h-12 rounded-lg object-cover shrink-0 bg-zinc-100 dark:bg-zinc-800" />}
                     <div className="flex flex-col justify-center overflow-hidden">
                       <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-200 truncate">{r.title}</span>
                       <span className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5"><Users className="w-3 h-3"/> {r.servings || '-'}</span>
                     </div>
                   </div>
                ))}
              </div>
            </div>
            <div className="flex-1 space-y-4">
               {Array.from({length: 7}).map((_, i) => {
                 const d = new Date(); d.setDate(d.getDate() + i);
                 const date = d.toISOString().split('T')[0];
                 const isToday = i === 0;
                 return (
                  <div key={date} className="bg-white dark:bg-zinc-900/50 p-5 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
                     <h3 className={`font-bold text-lg mb-3 ${isToday ? "text-orange-600 dark:text-orange-400" : "text-zinc-800 dark:text-zinc-200"}`}>
                       {d.toLocaleDateString(undefined, {weekday: 'long', month: 'short', day: 'numeric'})} {isToday && "(Today)"}
                     </h3>
                     <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                       {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map(meal => (
                          <div key={meal} 
                               onDragOver={e => e.preventDefault()} 
                               onDrop={async e => { 
                                 e.preventDefault(); 
                                 const recipeId = e.dataTransfer.getData("recipe_id"); 
                                 if(recipeId) {
                                   const {error} = await supabase.from('meal_plan').insert({date, meal_type: meal, recipe_id: recipeId});
                                   if(!error) fetchMealPlans();
                                   else toast.error("Failed to add meal plan.");
                                 }
                               }} 
                               className="min-h-[80px] border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-orange-400 dark:hover:border-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/10 rounded-xl p-2.5 transition-colors flex flex-col">
                             <div className="font-bold text-xs uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">{meal}</div>
                             {mealPlans.filter(m => m.date === date && m.meal_type === meal).map(m => (
                               <div key={m.id} className="bg-gradient-to-r from-orange-100 to-orange-50 dark:from-orange-900/40 dark:to-orange-900/20 text-orange-900 dark:text-orange-100 p-2 rounded-lg mt-1.5 flex justify-between items-center group shadow-sm text-sm border border-orange-200/50 dark:border-orange-800/50">
                                 <span className="truncate font-semibold cursor-pointer py-0.5" onClick={() => m.recipe && openRecipe(m.recipe)} title={m.recipe?.title}>{m.recipe?.title}</span>
                                 <button onClick={async () => {
                                   const {error} = await supabase.from('meal_plan').delete().eq('id', m.id);
                                   if(!error) fetchMealPlans();
                                 }} className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 p-1 rounded-md transition-all shrink-0 ml-2" title="Remove"><X className="w-3.5 h-3.5"/></button>
                               </div>
                             ))}
                          </div>
                       ))}
                     </div>
                  </div>
                 );
               })}
            </div>
          </div>
        ) : (
           <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
             <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
               <h2 className="text-2xl font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100"><ShoppingCart className="w-6 h-6 text-orange-500"/> Smart Shopping List</h2>
               <button 
                 onClick={async () => {
                   setIsGeneratingShopping(true);
                   const id = toast.loading("Aggregating ingredients with Gemini AI...");
                   try {
                     const today = new Date();
                     const nextWeek = new Date(); nextWeek.setDate(today.getDate() + 7);
                     const upcoming = mealPlans.filter(m => new Date(m.date) >= today && new Date(m.date) <= nextWeek);
                     if(upcoming.length === 0) throw new Error("No meals planned for the next 7 days!");
                     const rawIngredients = upcoming.flatMap(m => parseIngredients(m.recipe?.ingredients ? m.recipe.ingredients : []).map(i => `${i.amount} ${i.name}`));
                     
                     const res = await fetch('/api/shopping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingredients: rawIngredients }) });
                     const data = await res.json();
                     if (!res.ok) throw new Error(data.error);
                     
                     // Clear old list
                     await supabase.from("shopping_list").delete().neq("id", "00000000-0000-0000-0000-000000000000"); // deletes all
                     
                     const inserts = data.list.flatMap((group: any) => group.items.map((item: string) => ({ category: group.category, item, is_checked: false })));
                     if (inserts.length > 0) await supabase.from("shopping_list").insert(inserts);
                     
                     await fetchShoppingList();
                     toast.success("Shopping list generated!", { id });
                   } catch(err: any) {
                     toast.error(err.message, { id });
                   } finally { setIsGeneratingShopping(false); }
                 }}
                 disabled={isGeneratingShopping}
                 className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold min-h-[40px] px-4 rounded-xl shadow-sm transition-transform hover:scale-105">
                 <Wand2 className="w-4 h-4"/> Generate from Next 7 Days
               </button>
             </div>
             
             {shoppingList.length === 0 ? (
               <div className="text-center py-24 bg-white dark:bg-zinc-900/50 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
                 <ShoppingCart className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-700 mb-4"/>
                 <p className="text-xl font-bold text-zinc-500 dark:text-zinc-400">Your shopping list is empty.</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {(() => {
                   const grouped = shoppingList.reduce((acc, curr) => {
                     const cat = curr.category || 'Other';
                     if (!acc[cat]) acc[cat] = [];
                     acc[cat].push(curr);
                     return acc;
                   }, {} as Record<string, ShoppingItem[]>);
                   
                   return Object.entries(grouped).map(([cat, items]) => (
                     <div key={cat} className="bg-white dark:bg-zinc-900/50 p-5 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
                       <h3 className="font-bold text-lg text-orange-600 dark:text-orange-400 mb-3 ml-2">{cat}</h3>
                       <div className="space-y-1">
                         {items.map(item => (
                           <div key={item.id} className="flex items-start gap-3 p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl group transition-colors">
                             <input type="checkbox" checked={item.is_checked} onChange={async (e) => {
                               await supabase.from("shopping_list").update({is_checked: e.target.checked}).eq("id", item.id);
                               fetchShoppingList();
                             }} className="w-5 h-5 mt-0.5 rounded border border-zinc-300 dark:border-zinc-600 text-orange-500 focus:ring-orange-500 cursor-pointer bg-white dark:bg-zinc-800"/>
                             <span className={`flex-1 text-sm ${item.is_checked ? "line-through text-zinc-400 dark:text-zinc-500" : "text-zinc-800 dark:text-zinc-200"}`}>{item.item}</span>
                             <button onClick={async () => {
                               await supabase.from("shopping_list").delete().eq("id", item.id);
                               fetchShoppingList();
                             }} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 p-1"><X className="w-4 h-4"/></button>
                           </div>
                         ))}
                       </div>
                     </div>
                   ));
                 })()}
               </div>
             )}
           </div>
        )}

        {/* Recipe Viewer Dialog */}
        <Dialog open={!!selectedRecipe} onOpenChange={(open) => !open && setSelectedRecipe(null)}>
          <DialogContent className="sm:max-w-[780px] max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-0">
            {selectedRecipe && (() => {
              const baseServings = selectedRecipe.servings || 1;
              const scale = scaledServings / baseServings;

              function scaleAmount(amount: string): string {
                if (!amount || amount === "—") return amount;
                // Replace all numbers / fractions in the string
                return amount.replace(/(\d+\.?\d*|\.\d+)/g, (n) => {
                  const scaled = parseFloat(n) * scale;
                  // Format nicely: show up to 2 decimal places, drop trailing zeros
                  return scaled % 1 === 0 ? String(Math.round(scaled)) : scaled.toFixed(2).replace(/\.?0+$/, "");
                });
              }

              const parsed = parseIngredients(selectedRecipe.ingredients);
              const steps = selectedRecipe.instructions.split(/\n+/).map(s => s.trim()).filter(Boolean);
              return (
                <div className="flex flex-col">
                  {selectedRecipe.image_url && (
                    <div className="w-full h-60 sm:h-80 overflow-hidden shrink-0 rounded-t-3xl">
                      <img src={selectedRecipe.image_url} className="w-full h-full object-cover" alt={selectedRecipe.title} />
                    </div>
                  )}
                  <div className="p-6 sm:p-10 space-y-8">
                    <DialogHeader className="text-left space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <DialogTitle className="text-3xl md:text-4xl font-extrabold tracking-tight">{selectedRecipe.title}</DialogTitle>
                        <div className="flex items-center gap-1 shrink-0 pt-1">
                          <button onClick={() => { navigator.clipboard.writeText(window.location.origin + "/recipe/" + selectedRecipe.id); toast.success("Shared recipe link copied!"); }} className="p-2 rounded-full text-zinc-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors" title="Share recipe">
                            <Share2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => window.print()} className="p-2 rounded-full text-zinc-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" title="Print recipe">
                            <Printer className="w-4 h-4" />
                          </button>
                          <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-1"></div>
                          <button onClick={() => { setCookStep(0); setIsCookMode(true); }} className="p-2 rounded-full text-zinc-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors" title="Cook Mode">
                            <Flame className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedRecipe(null); openForm(selectedRecipe); }} className="p-2 rounded-full text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Edit recipe">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(selectedRecipe); }} className="p-2 rounded-full text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete recipe">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap pt-1">
                        {selectedRecipe.servings && (
                          <div className="inline-flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-full px-3 py-1.5">
                            <Users className="w-4 h-4 text-orange-500" />
                            <button onClick={() => setScaledServings(s => Math.max(1, s - 1))} className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 hover:bg-orange-200 flex items-center justify-center font-bold transition-colors"><Minus className="w-3 h-3" /></button>
                            <span className="text-sm font-bold text-orange-600 dark:text-orange-400 min-w-[1.5rem] text-center">{scaledServings}</span>
                            <button onClick={() => setScaledServings(s => s + 1)} className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 hover:bg-orange-200 flex items-center justify-center font-bold transition-colors"><Plus className="w-3 h-3" /></button>
                            <span className="text-xs font-semibold text-orange-500 ml-1">{scaledServings === selectedRecipe.servings ? "servings" : `servings (base: ${selectedRecipe.servings})`}</span>
                          </div>
                        )}
                        <span className="text-sm text-zinc-400 font-medium">{parsed.length} ingredients</span>
                      </div>
                      {selectedRecipe.description && (
                        <DialogDescription className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed pt-1">{selectedRecipe.description}</DialogDescription>
                      )}
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                      <div className="md:col-span-2">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><ChefHat className="w-5 h-5 text-orange-500" /> Ingredients</h3>
                        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                          <table className="w-full text-sm">
                            <tbody>
                              {parsed.map((ing, i) => (
                                <tr key={i} className={`${i % 2 === 0 ? "bg-zinc-50 dark:bg-zinc-900" : "bg-white dark:bg-zinc-900/50"} border-b border-zinc-100 dark:border-zinc-800 last:border-0`}>
                                  <td className="py-2.5 px-4 font-semibold text-orange-600 dark:text-orange-400 whitespace-nowrap w-1/3">{scaleAmount(ing.amount) || "—"}</td>
                                  <td className="py-2.5 px-4 text-zinc-800 dark:text-zinc-200">{ing.name}{ing.details ? <span className="text-zinc-500 dark:text-zinc-400">, {ing.details}</span> : ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {selectedRecipe.nutrition && (() => {
                          const n = selectedRecipe.nutrition;
                          const s = scale;
                          const fmt = (v: number) => Math.round(v * s);
                          return (
                            <div className="mt-4">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Per serving {scale !== 1 ? `(scaled ×${scale.toFixed(2)})` : ''}</h4>
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { label: "Calories", value: fmt(n.calories), unit: "kcal", color: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400" },
                                  { label: "Protein", value: fmt(n.protein_g), unit: "g", color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" },
                                  { label: "Carbs", value: fmt(n.carbs_g), unit: "g", color: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400" },
                                  { label: "Fat", value: fmt(n.fat_g), unit: "g", color: "bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400" },
                                ].map(stat => (
                                  <div key={stat.label} className={`rounded-xl p-2.5 text-center border border-transparent ${stat.color}`}>
                                    <div className="text-lg font-extrabold">{stat.value}<span className="text-xs font-medium ml-0.5">{stat.unit}</span></div>
                                    <div className="text-[10px] uppercase tracking-widest font-bold opacity-70 mt-0.5">{stat.label}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="md:col-span-3">
                        <h3 className="text-lg font-bold mb-4">Instructions</h3>
                        <ol className="space-y-4">
                          {steps.map((step, i) => (
                            <li key={i} className="flex gap-4">
                              <span className="shrink-0 w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold mt-0.5">{i + 1}</span>
                              <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{step.replace(/^step\s*\d+[.:)]\s*/i, "")}</p>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>

                    {/* Rating & Notes */}
                    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Your Rating:</span>
                        <div className="flex gap-1">
                          {[1,2,3,4,5].map(star => (
                            <button key={star} onClick={async () => {
                              const newRating = selectedRecipe.rating === star ? null : star;
                              await supabase.from("recipes").update({ rating: newRating }).eq("id", selectedRecipe.id);
                              setSelectedRecipe({ ...selectedRecipe, rating: newRating });
                              fetchRecipes();
                            }} className="transition-transform hover:scale-125">
                              <Star className={`w-6 h-6 ${star <= (selectedRecipe.rating || 0) ? "fill-yellow-400 text-yellow-400" : "text-zinc-300 dark:text-zinc-600"}`} />
                            </button>
                          ))}
                        </div>
                        {selectedRecipe.rating && <span className="text-xs text-zinc-400 font-medium">Click again to remove</span>}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Personal Notes</label>
                        <textarea
                          defaultValue={selectedRecipe.notes || ""}
                          onBlur={async (e) => {
                            await supabase.from("recipes").update({ notes: e.target.value }).eq("id", selectedRecipe.id);
                            setSelectedRecipe({ ...selectedRecipe, notes: e.target.value });
                            fetchRecipes();
                          }}
                          placeholder="e.g. Add more garlic next time, great with crusty bread..."
                          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-400/60 min-h-[70px] resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Cook Mode Dialog */}
        {selectedRecipe && (
          <Dialog open={isCookMode} onOpenChange={(open) => !open && setIsCookMode(false)}>
            <DialogTrigger className="hidden" />
            <DialogContent className="max-w-none w-screen h-screen max-h-screen rounded-none border-0 bg-zinc-950 text-white flex flex-col p-0">
              {(() => {
                const steps = selectedRecipe.instructions.split(/\n+/).map(s => s.trim()).filter(Boolean);
                const currentStep = steps[cookStep] || "";
                const isFirst = cookStep === 0;
                const isLast = cookStep === steps.length - 1;
                return (
                  <div className="flex flex-col h-full">
                    {/* Top bar */}
                    <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
                      <div className="flex items-center gap-3">
                        <ChefHat className="w-6 h-6 text-orange-400" />
                        <span className="font-bold text-lg text-white truncate max-w-[240px]">{selectedRecipe.title}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-white/50">Step {cookStep + 1} of {steps.length}</span>
                        <button onClick={() => setIsCookMode(false)} className="p-2 rounded-full hover:bg-white/10 transition-colors"><X className="w-5 h-5" /></button>
                      </div>
                    </div>
                    {/* Step content */}
                    <div className="flex-1 flex items-center justify-center px-8 sm:px-24">
                      <div className="max-w-2xl text-center space-y-8">
                        <div className="w-16 h-16 rounded-full bg-orange-500 text-white flex items-center justify-center text-3xl font-black mx-auto shadow-lg shadow-orange-500/30">{cookStep + 1}</div>
                        <p className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-relaxed text-white">
                          {currentStep.replace(/^step\s*\d+[.:)]\s*/i, "")}
                        </p>
                      </div>
                    </div>
                    {/* Progress dots */}
                    <div className="flex justify-center gap-1.5 py-4">
                      {steps.map((_, i) => (
                        <button key={i} onClick={() => setCookStep(i)} className={`rounded-full transition-all ${ i === cookStep ? "w-6 h-2.5 bg-orange-500" : "w-2.5 h-2.5 bg-white/20 hover:bg-white/40" }`} />
                      ))}
                    </div>
                    {/* Navigation */}
                    <div className="flex gap-4 px-6 pb-8">
                      <Button onClick={() => setCookStep(s => Math.max(0, s - 1))} disabled={isFirst} variant="outline" className="flex-1 h-14 text-lg font-bold rounded-2xl border-white/20 text-white hover:bg-white/10 bg-transparent">
                        ← Previous
                      </Button>
                      {isLast ? (
                        <Button onClick={() => setIsCookMode(false)} className="flex-1 h-14 text-lg font-bold rounded-2xl bg-orange-500 hover:bg-orange-600">
                          ✓ Done!
                        </Button>
                      ) : (
                        <Button onClick={() => setCookStep(s => Math.min(steps.length - 1, s + 1))} className="flex-1 h-14 text-lg font-bold rounded-2xl bg-orange-500 hover:bg-orange-600">
                          Next →
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </DialogContent>
          </Dialog>
        )}

        {/* Suggest / What can I cook Modal */}
        <Dialog open={isSuggestModalOpen} onOpenChange={v => { setIsSuggestModalOpen(v); if (!v) setSuggestedRecipes(null); }}>
          <DialogContent className="sm:max-w-[600px] rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2"><Wand2 className="w-6 h-6 text-purple-500" /> What can I cook?</DialogTitle>
              <DialogDescription>Enter the ingredients you have available, separated by commas. We'll ask Gemini to find the best matching recipes from your vault.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSuggest} className="space-y-4 pt-2">
              <div className="flex gap-2">
                <Input value={suggestIngredients} onChange={(e) => setSuggestIngredients(e.target.value)} placeholder="e.g. tomatoes, pasta, garlic, chicken..." className="flex-1" />
                <Button type="submit" disabled={isSuggesting || !suggestIngredients} className="bg-purple-600 hover:bg-purple-700 text-white min-w-[100px]">
                  {isSuggesting ? "Thinking..." : "Suggest!"}
                </Button>
              </div>
            </form>

            {suggestedRecipes !== null && (
              <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
                <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">Found {suggestedRecipes.length} suggestion{suggestedRecipes.length !== 1 ? 's' : ''}</h3>
                {suggestedRecipes.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No great matches found for those ingredients. Try adding a few more staples!</p>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {suggestedRecipes.map(recipe => (
                      <div key={recipe.id} onClick={() => { setIsSuggestModalOpen(false); openRecipe(recipe); }} className="flex gap-4 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer border border-zinc-100 dark:border-zinc-800 transition-colors">
                        {recipe.image_url && <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0"><img src={recipe.image_url} alt="" className="w-full h-full object-cover" /></div>}
                        <div>
                          <h4 className="font-bold text-zinc-900 dark:text-zinc-100">{recipe.title}</h4>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                            {parseIngredients(recipe.ingredients).map(i => i.name).join(', ')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add/Edit Recipe Form Dialog */}
        <Dialog open={isFormOpen} onOpenChange={(v) => { if (!v) closeForm(); }}>
          <DialogTrigger className="hidden" />
          <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto rounded-2xl w-[95vw] sm:w-full bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">{editingRecipe ? "Edit Recipe" : "Add New Recipe"}</DialogTitle>
              <DialogDescription className="text-zinc-500">{editingRecipe ? "Update the details of your recipe." : "Paste a link to auto-fill, or enter details manually."}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              {!editingRecipe && (
                <div className="bg-zinc-100 dark:bg-zinc-800/60 p-4 rounded-xl space-y-3 border border-zinc-200 dark:border-zinc-700/50">
                  <Label htmlFor="extract" className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm flex items-center gap-2">
                    <ChefHat className="w-4 h-4 text-orange-500" /> Auto-Fill from Website or Instagram
                  </Label>
                  <div className="flex gap-2">
                    <Input id="extract" type="url" value={extractUrl} onChange={(e) => setExtractUrl(e.target.value)} placeholder="https://..." className="bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700" />
                    <Button onClick={handleExtract} disabled={isExtracting || !extractUrl} type="button" variant="secondary" className="whitespace-nowrap px-4 font-medium">
                      {isExtracting ? "Extracting..." : "Auto-Fill"}
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="title" className="font-semibold text-zinc-700 dark:text-zinc-300">Title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Spaghetti Bolognese" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="servings" className="font-semibold text-zinc-700 dark:text-zinc-300">Servings</Label>
                  <Input id="servings" type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="e.g. 4" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image" className="font-semibold text-zinc-700 dark:text-zinc-300">Image URL (optional)</Label>
                  <Input id="image" type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="font-semibold text-zinc-700 dark:text-zinc-300">Description (optional)</Label>
                <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A quick summary of the dish..." className="min-h-[70px]" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ingredients" className="font-semibold text-zinc-700 dark:text-zinc-300">
                  Ingredients <span className="ml-1 text-xs font-normal text-zinc-400">One per line, e.g. "200g pasta"</span>
                </Label>
                <Textarea id="ingredients" value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder={"200g pasta\n2 tbsp olive oil\n3 cloves garlic"} required className="min-h-[110px] font-mono text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instructions" className="font-semibold text-zinc-700 dark:text-zinc-300">Instructions</Label>
                <Textarea id="instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Step by step instructions..." required className="min-h-[120px]" />
              </div>
              <div className="pt-2">
                <Button type="submit" disabled={isSaving} className="w-full bg-orange-500 hover:bg-orange-600 rounded-lg text-white font-semibold text-base h-11">
                  {isSaving ? "Saving..." : (editingRecipe ? "Update Recipe" : "Save Recipe")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Settings Dialog */}
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogTrigger className="hidden" />
          <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2"><Settings className="w-6 h-6 text-orange-500" /> Settings</DialogTitle>
              <DialogDescription>Configure the Gemini AI model, prompt, and API keys.</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-2">
              <div className="space-y-4 border-b border-zinc-100 dark:border-zinc-800 pb-6">
                <Label className="font-bold text-zinc-800 dark:text-zinc-200 text-lg">API Key Configuration</Label>
                <div className="grid gap-4">
                  <div className="space-y-2 mt-2">
                    <Label className="font-semibold text-zinc-700 dark:text-zinc-300">Active API Key Environment Variable</Label>
                    <Select value={String(activeApiKey)} onValueChange={(v) => setActiveApiKey(parseInt(v || "1") as 1 | 2)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select active key" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Use GEMINI_API_KEY_1</SelectItem>
                        <SelectItem value="2">Use GEMINI_API_KEY_2</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-zinc-400">Select which environment variable the server functions should use for Gemini processing.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold text-zinc-700 dark:text-zinc-300">Gemini Model</Label>
                <Select value={settingsModel} onValueChange={(v) => v && setSettingsModel(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-400">Flash is fastest; Pro is most accurate for complex pages.</p>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-zinc-700 dark:text-zinc-300">Extraction Prompt</Label>
                <Textarea value={settingsPrompt} onChange={(e) => setSettingsPrompt(e.target.value)} className="min-h-[300px] font-mono text-xs" />
                <p className="text-xs text-zinc-400">This is the prompt sent to Gemini. The webpage content is appended automatically.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={handleSaveSettings} disabled={isSavingSettings} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold">
                  {isSavingSettings ? "Saving..." : "Save Settings"}
                </Button>
                <Button onClick={() => { setSettingsPrompt(DEFAULT_PROMPT); }} variant="outline" className="flex-1">Reset Prompt to Default</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Recipe?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>"{deleteTarget?.title}"</strong>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      </>
      )}
    </div>
  );
}
