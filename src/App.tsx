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
import { Plus, ChefHat, Users, Settings, Pencil, Trash2, Search, X, Star, Minus, Flame } from "lucide-react";
import { Toaster, toast } from "sonner";

const DEFAULT_PROMPT = `You are a culinary assistant that extracts recipes from raw extracted webpage text.
Your task is to find the recipe within the text below and return it strictly formatted as a JSON object.

The JSON MUST match this EXACT structure, nothing else:
{
  "title": "Recipe Title",
  "description": "Short, enticing summary of the dish (1-2 sentences)",
  "servings": 4,
  "ingredients": [
    { "amount": "200g", "name": "pasta" },
    { "amount": "2 tbsp", "name": "olive oil" },
    { "amount": "", "name": "salt and pepper" }
  ],
  "instructions": "Step 1: Do this.\\nStep 2: Do that.",
  "image_url": "a high quality public image URL from the content (prefer og:image), or empty string"
}

CRITICAL RULES:
- "ingredients" MUST be an array of objects with "amount" and "name" keys.
- If an ingredient has no measurable amount, set "amount" to an empty string.
- "servings" must be an integer number or null if not found.
- "instructions" should use newlines to separate steps, remove any existing numbering.
- If the text comes from an Instagram post, the recipe might be in the Description field. Extract it accurately!`;

const MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'];

interface Nutrition { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; }
interface Ingredient { amount: string; name: string; }
interface Recipe {
  id: string; title: string; description: string;
  ingredients: Ingredient[] | string[]; instructions: string;
  image_url: string; servings: number | null; created_at: string;
  tags: string[]; is_favourite: boolean; nutrition: Nutrition | null;
}

function parseIngredients(raw: Ingredient[] | string[]): Ingredient[] {
  if (!raw || raw.length === 0) return [];
  if (typeof raw[0] === "object" && "name" in raw[0]) return raw as Ingredient[];
  return (raw as string[]).map(s => {
    const match = s.match(/^([\d\/\.\s]*(tbsp|tsp|cups?|g|kg|ml|l|oz|lb|cloves?|bunch|slices?|pinch|handful|pieces?|whole|large|medium|small|cans?)?[\s]*)/i);
    const amount = match ? match[0].trim() : "";
    return { amount, name: amount ? s.replace(amount, "").trim() : s };
  });
}

function recipeToIngredientText(ingredients: Ingredient[] | string[]): string {
  const parsed = parseIngredients(ingredients);
  return parsed.map(i => `${i.amount} ${i.name}`.trim()).join("\n");
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

  // Settings state
  const [settingsModel, setSettingsModel] = useState('gemini-2.5-flash');
  const [settingsPrompt, setSettingsPrompt] = useState(DEFAULT_PROMPT);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("recipes").select("*").order("created_at", { ascending: false });
    if (data) setRecipes(data);
    setLoading(false);
  }, []);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from("settings").select("gemini_model, gemini_prompt").eq("id", 1).single();
    if (data) {
      if (data.gemini_model) setSettingsModel(data.gemini_model);
      if (data.gemini_prompt) setSettingsPrompt(data.gemini_prompt);
    }
  }, []);

  useEffect(() => { fetchRecipes(); fetchSettings(); }, [fetchRecipes, fetchSettings]);

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
    const { error } = await supabase.from("settings").upsert({ id: 1, gemini_model: settingsModel, gemini_prompt: settingsPrompt });
    if (!error) { toast.success("Settings saved!"); setIsSettingsOpen(false); }
    else { toast.error("Failed to save settings: " + error.message); }
    setIsSavingSettings(false);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 sm:p-10 font-sans">
      <Toaster richColors position="top-right" />

      {/* Header */}
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-center justify-between border-b pb-6 border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3 text-zinc-900 dark:text-zinc-50">
            <ChefHat className="w-8 h-8 md:w-10 md:h-10 text-orange-500" />
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight">Recipe Vault</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSettingsOpen(true)} className="p-2.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" title="Settings">
              <Settings className="w-5 h-5" />
            </button>
            <button onClick={() => openForm()} className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-full px-6 shadow-md transition-transform hover:scale-105 h-10 text-sm">
              <Plus className="w-4 h-4" /> Add Recipe
            </button>
          </div>
        </header>

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
                        <div className="flex items-center gap-2 shrink-0 pt-1">
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
                                  <td className="py-2.5 px-4 text-zinc-800 dark:text-zinc-200">{ing.name}</td>
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
              <DialogDescription>Configure the Gemini AI model and extraction prompt.</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-2">
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
                <Button onClick={() => { setSettingsPrompt(DEFAULT_PROMPT); }} variant="outline" className="flex-1">Reset to Default</Button>
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
    </div>
  );
}
