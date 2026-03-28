import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseIngredients } from '@/lib/recipeUtils';
import type { Recipe } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectRecipe: (r: Recipe) => void;
}

export function SuggestModal({ isOpen, onClose, onSelectRecipe }: Props) {
  const [ingredientInput, setIngredientInput] = useState('');
  const [suggested, setSuggested] = useState<Recipe[] | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);

  async function handleSuggest(e: React.FormEvent) {
    e.preventDefault();
    if (!ingredientInput.trim()) return;
    setIsSuggesting(true);
    const id = toast.loading('Finding matches with Gemini AI...');
    try {
      const ingredientsList = ingredientInput.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: ingredientsList }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to suggest recipes');
      setSuggested(data.suggestions || []);
      toast.success('Found some delicious matches!', { id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Couldn't suggest recipes.";
      toast.error(message, { id });
    } finally {
      setIsSuggesting(false);
    }
  }

  function handleClose() {
    onClose();
    setSuggested(null);
    setIngredientInput('');
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[600px] rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-purple-500" /> What can I cook?
          </DialogTitle>
          <DialogDescription>
            Enter the ingredients you have available, separated by commas. We'll ask Gemini to find the best matching recipes from your vault.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSuggest} className="space-y-4 pt-2">
          <div className="flex gap-2">
            <Input
              value={ingredientInput}
              onChange={(e) => setIngredientInput(e.target.value)}
              placeholder="e.g. tomatoes, pasta, garlic, chicken..."
              className="flex-1"
            />
            <Button type="submit" disabled={isSuggesting || !ingredientInput} className="bg-purple-600 hover:bg-purple-700 text-white min-w-[100px]">
              {isSuggesting ? 'Thinking...' : 'Suggest!'}
            </Button>
          </div>
        </form>

        {suggested !== null && (
          <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
            <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">
              Found {suggested.length} suggestion{suggested.length !== 1 ? 's' : ''}
            </h3>
            {suggested.length === 0 ? (
              <p className="text-zinc-500 text-sm">No great matches found. Try adding a few more staples!</p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {suggested.map((recipe) => (
                  <div
                    key={recipe.id}
                    onClick={() => { handleClose(); onSelectRecipe(recipe); }}
                    className="flex gap-4 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer border border-zinc-100 dark:border-zinc-800 transition-colors"
                  >
                    {recipe.image_url && (
                      <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0">
                        <img src={recipe.image_url} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-zinc-900 dark:text-zinc-100">{recipe.title}</h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                        {parseIngredients(recipe.ingredients).map((i) => i.name).join(', ')}
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
  );
}
