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
              <form onSubmit={handleSubmit} className="space-y-5 py-4">
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
                <Card key={recipe.id} className="overflow-hidden flex flex-col group hover:shadow-2xl transition-all duration-300 border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl">
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
      </div>
    </div>
  );
}
