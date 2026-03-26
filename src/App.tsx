import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ChefHat } from "lucide-react";

interface Recipe {
  id: string;
  title: string;
  description: string;
  ingredients: string[];
  instructions: string;
  image_url: string;
  created_at: string;
}

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  
  // URL Extraction state
  const [extractUrl, setExtractUrl] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [instructions, setInstructions] = useState("");
  const [imageUrl, setImageUrl] = useState("");

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
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: extractUrl })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract recipe');
      }

      setTitle(data.title || "");
      setDescription(data.description || "");
      setIngredients(Array.isArray(data.ingredients) ? data.ingredients.join(",\\n") : (data.ingredients || ""));
      setInstructions(data.instructions || "");
      setImageUrl(data.image_url || "");
      
      alert("Recipe extracted successfully! Please review the details below.");
    } catch (err: any) {
      console.error("Extraction error:", err);
      alert(err.message || 'Trouble extracting recipe. Ensure the URL is valid.');
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ingredientsList = ingredients.split(",").map(i => i.trim()).filter(Boolean);
    const newRecipe = {
      title,
      description,
      ingredients: ingredientsList,
      instructions,
      image_url: imageUrl || "https://images.unsplash.com/photo-1495521821757-a1efb6729352?q=80&w=600&auto=format&fit=crop",
    };

    const { error } = await supabase.from("recipes").insert([newRecipe]);
    if (!error) {
      setIsOpen(false);
      setTitle("");
      setDescription("");
      setIngredients("");
      setInstructions("");
      setImageUrl("");
      fetchRecipes();
    } else {
      console.error(error);
      alert("Failed to save recipe. Please ensure you have configured Supabase credentials and executed the SQL schema migrations.");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 sm:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-center justify-between border-b pb-6 border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3 text-zinc-900 dark:text-zinc-50">
            <ChefHat className="w-8 h-8 md:w-10 md:h-10 text-orange-500" />
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight">Recipe Vault</h1>
          </div>
          
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-full px-6 shadow-md transition-transform hover:scale-105 h-10 text-sm">
              <Plus className="w-4 h-4" /> Add Recipe
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px] rounded-2xl w-[95vw] sm:w-full bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">Add New Recipe</DialogTitle>
                <DialogDescription className="text-zinc-500">
                  Enter the details of your delicious recipe below.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4">
                
                {/* Auto Fill Section */}
                <div className="bg-zinc-100 dark:bg-zinc-800/60 p-4 rounded-xl space-y-3 mb-2 border border-zinc-200 dark:border-zinc-700/50">
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
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Spaghetti Bolognese" required className="rounded-lg shadow-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description" className="font-semibold text-zinc-700 dark:text-zinc-300">Description (optional)</Label>
                  <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A quick summary of the dish..." className="rounded-lg shadow-sm min-h-[80px]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ingredients" className="font-semibold text-zinc-700 dark:text-zinc-300">Ingredients</Label>
                  <Textarea id="ingredients" value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="Comma separated: pasta, tomatoes, garlic" required className="rounded-lg shadow-sm min-h-[80px]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instructions" className="font-semibold text-zinc-700 dark:text-zinc-300">Instructions</Label>
                  <Textarea id="instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Step by step instructions..." required className="rounded-lg shadow-sm min-h-[120px]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image" className="font-semibold text-zinc-700 dark:text-zinc-300">Image URL (optional)</Label>
                  <Input id="image" type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="rounded-lg shadow-sm" />
                </div>
                <DialogFooter className="pt-4">
                  <Button type="submit" className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 rounded-lg text-white font-medium">Save Recipe</Button>
                </DialogFooter>
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
            <div className="text-center py-32 text-zinc-500 bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-800">
              <ChefHat className="w-20 h-20 mx-auto mb-6 text-zinc-300 dark:text-zinc-700" />
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">No recipes yet</p>
              <p className="text-zinc-500 dark:text-zinc-400">Add your first recipe to get started!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {recipes.map(recipe => (
                <Card key={recipe.id} onClick={() => setSelectedRecipe(recipe)} className="cursor-pointer overflow-hidden flex flex-col group hover:shadow-2xl transition-all duration-300 border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl">
                  <div className="aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 relative">
                    <img 
                      src={recipe.image_url} 
                      alt={recipe.title}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                  <CardHeader className="pt-6 relative">
                    <CardTitle className="line-clamp-1 text-xl font-bold">{recipe.title}</CardTitle>
                    <CardDescription className="line-clamp-2 mt-2 text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
                      {recipe.description || "No description provided."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 pb-6 relative z-10">
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider mb-3 text-zinc-400">Ingredients ({recipe.ingredients.length})</h4>
                      <div className="flex flex-wrap gap-2">
                        {recipe.ingredients.slice(0, 5).map((ing, i) => (
                          <span key={i} className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800/80 text-xs font-medium rounded-md text-zinc-700 dark:text-zinc-300 line-clamp-1 whitespace-nowrap">
                            {ing}
                          </span>
                        ))}
                        {recipe.ingredients.length > 5 && (
                          <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800/80 text-xs font-medium rounded-md text-zinc-700 dark:text-zinc-300 shrink-0">
                            +{recipe.ingredients.length - 5}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="border-t border-zinc-100 dark:border-zinc-800/50 py-4 bg-zinc-50/50 dark:bg-zinc-900/50 backdrop-blur-sm">
                    <p className="text-xs font-semibold text-zinc-400 w-full text-right">Added {new Date(recipe.created_at).toLocaleDateString()}</p>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </main>

        <Dialog open={!!selectedRecipe} onOpenChange={(open) => !open && setSelectedRecipe(null)}>
          <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-0">
            {selectedRecipe && (
              <div className="flex flex-col h-full">
                {selectedRecipe.image_url && (
                  <div className="w-full h-64 sm:h-80 md:h-96 overflow-hidden shrink-0">
                    <img src={selectedRecipe.image_url} className="w-full h-full object-cover" alt={selectedRecipe.title} />
                  </div>
                )}
                
                <div className="p-6 sm:p-10 space-y-8">
                  <DialogHeader className="text-left space-y-3">
                    <DialogTitle className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">{selectedRecipe.title}</DialogTitle>
                    {selectedRecipe.description && (
                      <DialogDescription className="text-base md:text-lg text-zinc-600 dark:text-zinc-400 font-medium">
                        {selectedRecipe.description}
                      </DialogDescription>
                    )}
                  </DialogHeader>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                    <div className="md:col-span-1">
                      <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                        <ChefHat className="w-5 h-5 text-orange-500" /> Ingredients
                      </h3>
                      <ul className="space-y-2 text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900/50 p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800/80">
                        {selectedRecipe.ingredients.map((ing, i) => (
                          <li key={i} className="leading-relaxed flex items-start gap-2">
                            <span className="text-orange-500 mt-1">•</span> {ing}
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div className="md:col-span-2">
                      <h3 className="text-lg font-bold mb-4 text-zinc-900 dark:text-zinc-100">Instructions</h3>
                      <div className="prose dark:prose-invert max-w-none text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed text-base">
                        {selectedRecipe.instructions}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
