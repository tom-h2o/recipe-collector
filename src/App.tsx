import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ChefHat, Users } from "lucide-react";
import { Toaster, toast } from "sonner";

interface Ingredient {
  amount: string;
  name: string;
}

interface Recipe {
  id: string;
  title: string;
  description: string;
  ingredients: Ingredient[] | string[];
  instructions: string;
  image_url: string;
  servings: number | null;
  created_at: string;
}

function parseIngredients(raw: Ingredient[] | string[]): Ingredient[] {
  if (!raw || raw.length === 0) return [];
  if (typeof raw[0] === "object" && "name" in raw[0]) {
    return raw as Ingredient[];
  }
  // Fallback: plain strings → split on first whitespace group for amount
  return (raw as string[]).map(s => {
    const match = s.match(/^([\d\/\.\s]*(tbsp|tsp|cup|g|kg|ml|l|oz|lb|clove|cloves|bunch|slice|slices|pinch|handful|piece|pieces|whole|large|medium|small|can|cans)?[\s]*)/i);
    const amount = match ? match[0].trim() : "";
    const name = amount ? s.replace(amount, "").trim() : s;
    return { amount, name };
  });
}

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  // URL Extraction state
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

  useEffect(() => {
    fetchRecipes();
  }, []);

  async function fetchRecipes() {
    setLoading(true);
    const { data } = await supabase.from("recipes").select("*").order("created_at", { ascending: false });
    if (data) setRecipes(data);
    setLoading(false);
  }

  async function handleExtract(e: React.MouseEvent) {
    e.preventDefault();
    if (!extractUrl) return;
    setIsExtracting(true);
    const extractToast = toast.loading("Extracting recipe with Gemini AI...");
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: extractUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract recipe');

      setTitle(data.title || "");
      setDescription(data.description || "");
      setServings(data.servings ? String(data.servings) : "");
      setImageUrl(data.image_url || "");
      setInstructions(data.instructions || "");

      // Handle structured or plain ingredients
      if (Array.isArray(data.ingredients)) {
        if (data.ingredients.length > 0 && typeof data.ingredients[0] === "object") {
          setIngredients((data.ingredients as Ingredient[]).map(i => `${i.amount} ${i.name}`.trim()).join("\n"));
        } else {
          setIngredients((data.ingredients as string[]).join("\n"));
        }
      }

      toast.success("Recipe auto-filled! Review the details below.", { id: extractToast });
    } catch (err: any) {
      toast.error(err.message || "Couldn't extract recipe. Try a different URL.", { id: extractToast });
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    const ingredientsList = ingredients.split("\n").map(i => {
      const line = i.trim();
      const match = line.match(/^([\d\/\.\s]*(tbsp|tsp|cups?|g|kg|ml|l|oz|lb|cloves?|bunch|slices?|pinch|handful|pieces?|whole|large|medium|small|cans?)?[\s]*)/i);
      const amount = match ? match[0].trim() : "";
      const name = amount ? line.replace(amount, "").trim() : line;
      return { amount, name: name || line };
    }).filter(i => i.name);

    const newRecipe = {
      title,
      description,
      ingredients: ingredientsList,
      instructions,
      image_url: imageUrl || "https://images.unsplash.com/photo-1495521821757-a1efb6729352?q=80&w=600&auto=format&fit=crop",
      servings: servings ? parseInt(servings) : null,
    };

    const { error } = await supabase.from("recipes").insert([newRecipe]);
    if (!error) {
      setIsOpen(false);
      setTitle(""); setDescription(""); setIngredients(""); setInstructions(""); setImageUrl(""); setServings(""); setExtractUrl("");
      fetchRecipes();
      toast.success("Recipe saved! 🍽️");
    } else {
      console.error(error);
      toast.error("Failed to save: " + (error.message || "Check Supabase credentials/schema."));
    }
    setIsSaving(false);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 sm:p-10 font-sans">
      <Toaster richColors position="top-right" />
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-center justify-between border-b pb-6 border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3 text-zinc-900 dark:text-zinc-50">
            <ChefHat className="w-8 h-8 md:w-10 md:h-10 text-orange-500" />
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight">Recipe Vault</h1>
          </div>

          <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if (!v) { setExtractUrl(""); setTitle(""); setDescription(""); setIngredients(""); setInstructions(""); setImageUrl(""); setServings(""); } }}>
            <DialogTrigger className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-full px-6 shadow-md transition-transform hover:scale-105 h-10 text-sm">
              <Plus className="w-4 h-4" /> Add Recipe
            </DialogTrigger>
            <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto rounded-2xl w-[95vw] sm:w-full bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">Add New Recipe</DialogTitle>
                <DialogDescription className="text-zinc-500">Paste a link to auto-fill, or enter details manually.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-2">
                {/* Auto Fill */}
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
                    Ingredients
                    <span className="ml-2 text-xs font-normal text-zinc-400">One per line, e.g. "200g pasta"</span>
                  </Label>
                  <Textarea id="ingredients" value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder={"200g pasta\n2 tbsp olive oil\n3 cloves garlic"} required className="min-h-[110px] font-mono text-sm" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instructions" className="font-semibold text-zinc-700 dark:text-zinc-300">Instructions</Label>
                  <Textarea id="instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Step by step instructions..." required className="min-h-[120px]" />
                </div>

                <div className="pt-2">
                  <Button type="submit" disabled={isSaving} className="w-full bg-orange-500 hover:bg-orange-600 rounded-lg text-white font-semibold text-base h-11">
                    {isSaving ? "Saving..." : "Save Recipe"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </header>

        <main>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse h-[400px] bg-zinc-200 dark:bg-zinc-800 rounded-xl border-none" />
              ))}
            </div>
          ) : recipes.length === 0 ? (
            <div className="text-center py-32 bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-800">
              <ChefHat className="w-20 h-20 mx-auto mb-6 text-zinc-300 dark:text-zinc-700" />
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">No recipes yet</p>
              <p className="text-zinc-500 dark:text-zinc-400">Click "Add Recipe" to get started!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {recipes.map(recipe => {
                const parsed = parseIngredients(recipe.ingredients);
                return (
                  <Card key={recipe.id} onClick={() => setSelectedRecipe(recipe)} className="cursor-pointer overflow-hidden flex flex-col group hover:shadow-2xl transition-all duration-300 border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl">
                    <div className="aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 relative">
                      <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
                        <span className="text-white text-sm font-semibold tracking-wide bg-white/20 backdrop-blur-sm px-4 py-1.5 rounded-full border border-white/30">View Recipe</span>
                      </div>
                    </div>
                    <CardHeader className="pt-5">
                      <CardTitle className="line-clamp-1 text-xl font-bold">{recipe.title}</CardTitle>
                      <CardDescription className="line-clamp-2 mt-1 text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
                        {recipe.description || "No description provided."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 pb-4">
                      <h4 className="font-bold text-xs uppercase tracking-wider mb-3 text-zinc-400">{parsed.length} Ingredient{parsed.length !== 1 ? "s" : ""}</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {parsed.slice(0, 5).map((ing, i) => (
                          <span key={i} className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800/80 text-xs font-medium rounded-md text-zinc-700 dark:text-zinc-300 max-w-[140px] truncate">
                            {ing.name}
                          </span>
                        ))}
                        {parsed.length > 5 && (
                          <span className="px-2.5 py-1 bg-orange-50 dark:bg-orange-900/20 text-xs font-medium rounded-md text-orange-600 dark:text-orange-400">
                            +{parsed.length - 5} more
                          </span>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="border-t border-zinc-100 dark:border-zinc-800/50 py-3 bg-zinc-50/50 dark:bg-zinc-900/50 flex justify-between items-center">
                      {recipe.servings ? (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                          <Users className="w-3.5 h-3.5" /> Serves {recipe.servings}
                        </span>
                      ) : <span />}
                      <p className="text-xs font-semibold text-zinc-400">{new Date(recipe.created_at).toLocaleDateString()}</p>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </main>

        {/* Recipe Viewer */}
        <Dialog open={!!selectedRecipe} onOpenChange={(open) => !open && setSelectedRecipe(null)}>
          <DialogContent className="sm:max-w-[780px] max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-0">
            {selectedRecipe && (() => {
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
                      <DialogTitle className="text-3xl md:text-4xl font-extrabold tracking-tight">{selectedRecipe.title}</DialogTitle>
                      <div className="flex items-center gap-4 flex-wrap pt-1">
                        {selectedRecipe.servings && (
                          <span className="inline-flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 text-sm font-bold px-4 py-1.5 rounded-full border border-orange-200 dark:border-orange-800/50">
                            <Users className="w-4 h-4" /> Serves {selectedRecipe.servings}
                          </span>
                        )}
                        <span className="text-sm text-zinc-400 font-medium">{parsed.length} ingredients</span>
                      </div>
                      {selectedRecipe.description && (
                        <DialogDescription className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed pt-1">
                          {selectedRecipe.description}
                        </DialogDescription>
                      )}
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                      {/* Ingredients */}
                      <div className="md:col-span-2">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                          <ChefHat className="w-5 h-5 text-orange-500" /> Ingredients
                        </h3>
                        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                          <table className="w-full text-sm">
                            <tbody>
                              {parsed.map((ing, i) => (
                                <tr key={i} className={`${i % 2 === 0 ? "bg-zinc-50 dark:bg-zinc-900" : "bg-white dark:bg-zinc-900/50"} border-b border-zinc-100 dark:border-zinc-800 last:border-0`}>
                                  <td className="py-2.5 px-4 font-semibold text-orange-600 dark:text-orange-400 whitespace-nowrap w-1/3">{ing.amount || "—"}</td>
                                  <td className="py-2.5 px-4 text-zinc-800 dark:text-zinc-200">{ing.name}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Instructions */}
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
      </div>
    </div>
  );
}
