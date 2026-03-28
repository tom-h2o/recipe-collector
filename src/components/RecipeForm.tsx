import { useState, useEffect } from 'react';
import { ChefHat } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parseIngredients, recipeToIngredientText } from '@/lib/recipeUtils';
import type { Recipe, Ingredient } from '@/types';

type RecipePayload = Omit<Recipe, 'id' | 'created_at' | 'tags' | 'is_favourite' | 'nutrition' | 'rating' | 'notes' | 'user_id'>;

interface Props {
  isOpen: boolean;
  editingRecipe: Recipe | null;
  onClose: () => void;
  onSave: (payload: RecipePayload, editingId?: string) => Promise<void>;
}

export function RecipeForm({ isOpen, editingRecipe, onClose, onSave }: Props) {
  const [extractUrl, setExtractUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [instructions, setInstructions] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [servings, setServings] = useState('');

  useEffect(() => {
    if (editingRecipe) {
      setTitle(editingRecipe.title);
      setDescription(editingRecipe.description || '');
      setIngredients(recipeToIngredientText(editingRecipe.ingredients));
      setInstructions(editingRecipe.instructions || '');
      setImageUrl(editingRecipe.image_url || '');
      setServings(editingRecipe.servings ? String(editingRecipe.servings) : '');
    } else {
      setTitle(''); setDescription(''); setIngredients('');
      setInstructions(''); setImageUrl(''); setServings(''); setExtractUrl('');
    }
  }, [editingRecipe, isOpen]);

  async function handleExtract(e: React.MouseEvent) {
    e.preventDefault();
    if (!extractUrl) return;
    setIsExtracting(true);
    const id = toast.loading('Extracting recipe with Gemini AI...');
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: extractUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract recipe');
      setTitle(data.title || '');
      setDescription(data.description || '');
      setServings(data.servings ? String(data.servings) : '');
      setImageUrl(data.image_url || '');
      setInstructions(data.instructions || '');
      if (Array.isArray(data.ingredients)) {
        if (data.ingredients.length > 0 && typeof data.ingredients[0] === 'object') {
          setIngredients((data.ingredients as Ingredient[]).map((i) => `${i.amount} ${i.name}`.trim()).join('\n'));
        } else {
          setIngredients((data.ingredients as string[]).join('\n'));
        }
      }
      toast.success('Recipe auto-filled! Review the details below.', { id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Couldn't extract recipe.";
      toast.error(message, { id });
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    const ingredientsList = parseIngredients(
      ingredients.split('\n').map((line) => line.trim()).filter(Boolean)
    );
    const payload: RecipePayload = {
      title,
      description,
      ingredients: ingredientsList,
      instructions,
      image_url: imageUrl || 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?q=80&w=600&auto=format&fit=crop',
      servings: servings ? parseInt(servings) : null,
    };
    try {
      await onSave(payload, editingRecipe?.id);
      toast.success(editingRecipe ? 'Recipe updated!' : 'Recipe saved!');
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save recipe';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogTrigger className="hidden" />
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto rounded-2xl w-[95vw] sm:w-full bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {editingRecipe ? 'Edit Recipe' : 'Add New Recipe'}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            {editingRecipe ? 'Update the details of your recipe.' : 'Paste a link to auto-fill, or enter details manually.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {!editingRecipe && (
            <div className="bg-zinc-100 dark:bg-zinc-800/60 p-4 rounded-xl space-y-3 border border-zinc-200 dark:border-zinc-700/50">
              <Label htmlFor="extract" className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-orange-500" /> Auto-Fill from Website or Instagram
              </Label>
              <div className="flex gap-2">
                <Input
                  id="extract"
                  type="url"
                  value={extractUrl}
                  onChange={(e) => setExtractUrl(e.target.value)}
                  placeholder="https://..."
                  className="bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700"
                />
                <Button onClick={handleExtract} disabled={isExtracting || !extractUrl} type="button" variant="secondary" className="whitespace-nowrap px-4 font-medium">
                  {isExtracting ? 'Extracting...' : 'Auto-Fill'}
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
            <Textarea id="ingredients" value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder={'200g pasta\n2 tbsp olive oil\n3 cloves garlic'} required className="min-h-[110px] font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instructions" className="font-semibold text-zinc-700 dark:text-zinc-300">Instructions</Label>
            <Textarea id="instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Step by step instructions..." required className="min-h-[120px]" />
          </div>
          <div className="pt-2">
            <Button type="submit" disabled={isSaving} className="w-full bg-orange-500 hover:bg-orange-600 rounded-lg text-white font-semibold text-base h-11">
              {isSaving ? 'Saving...' : editingRecipe ? 'Update Recipe' : 'Save Recipe'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
