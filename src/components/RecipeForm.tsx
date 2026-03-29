import { useState, useEffect, useRef } from 'react';
import { ChefHat, Link, Camera, ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parseIngredients, recipeToIngredientText } from '@/lib/recipeUtils';
import { supabase } from '@/lib/supabase';
import type { Recipe, Ingredient } from '@/types';

type RecipePayload = Omit<Recipe, 'id' | 'created_at' | 'tags' | 'is_favourite' | 'nutrition' | 'rating' | 'notes' | 'user_id'>;
type ImportTab = 'url' | 'photo';

interface Props {
  isOpen: boolean;
  editingRecipe: Recipe | null;
  onClose: () => void;
  onSave: (payload: RecipePayload, editingId?: string) => Promise<void>;
}

function domainFrom(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function RecipeForm({ isOpen, editingRecipe, onClose, onSave }: Props) {
  const [importTab, setImportTab] = useState<ImportTab>('url');
  const [extractUrl, setExtractUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Photo import state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isExtractingPhoto, setIsExtractingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [instructions, setInstructions] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [servings, setServings] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceName, setSourceName] = useState('');

  useEffect(() => {
    if (editingRecipe) {
      setTitle(editingRecipe.title);
      setDescription(editingRecipe.description || '');
      setIngredients(recipeToIngredientText(editingRecipe.ingredients));
      setInstructions(editingRecipe.instructions || '');
      setImageUrl(editingRecipe.image_url || '');
      setServings(editingRecipe.servings ? String(editingRecipe.servings) : '');
      setSourceUrl(editingRecipe.source_url || '');
      setSourceName(editingRecipe.source_name || '');
    } else {
      setTitle(''); setDescription(''); setIngredients('');
      setInstructions(''); setImageUrl(''); setServings('');
      setExtractUrl(''); setSourceUrl(''); setSourceName('');
      setPhotoFile(null); setPhotoPreview(null);
      setImageFile(null); setImagePreview(null);
    }
  }, [editingRecipe, isOpen]);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handlePhotoExtract() {
    if (!photoFile) return;
    setIsExtractingPhoto(true);
    const id = toast.loading('Analysing photo with Gemini AI...');
    try {
      const base64 = await fileToBase64(photoFile);
      const res = await fetch('/api/extract-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: photoFile.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract recipe');
      setTitle(data.title || '');
      setDescription(data.description || '');
      setServings(data.servings ? String(data.servings) : '');
      setInstructions(data.instructions || '');
      if (Array.isArray(data.ingredients)) {
        if (data.ingredients.length > 0 && typeof data.ingredients[0] === 'object') {
          setIngredients((data.ingredients as Ingredient[]).map((i) => `${i.amount} ${i.name}`.trim()).join('\n'));
        } else {
          setIngredients((data.ingredients as string[]).join('\n'));
        }
      }
      // Use the photo itself as the recipe image
      setImagePreview(photoPreview);
      setImageFile(photoFile);
      toast.success('Recipe extracted from photo!', { id });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Couldn't extract recipe.", { id });
    } finally {
      setIsExtractingPhoto(false);
    }
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageUrl('');
  }

  async function uploadImage(file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('recipe-images').upload(path, file, { upsert: false });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('recipe-images').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleExtractUrl(e: React.MouseEvent) {
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
      setSourceUrl(extractUrl);
      setSourceName((prev) => prev || domainFrom(extractUrl));
      if (Array.isArray(data.ingredients)) {
        if (data.ingredients.length > 0 && typeof data.ingredients[0] === 'object') {
          setIngredients((data.ingredients as Ingredient[]).map((i) => `${i.amount} ${i.name}`.trim()).join('\n'));
        } else {
          setIngredients((data.ingredients as string[]).join('\n'));
        }
      }
      toast.success('Recipe auto-filled! Review the details below.', { id });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Couldn't extract recipe.", { id });
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      let finalImageUrl = imageUrl;

      if (imageFile) {
        setIsUploadingImage(true);
        finalImageUrl = await uploadImage(imageFile);
        setIsUploadingImage(false);
      }

      const ingredientsList = parseIngredients(
        ingredients.split('\n').map((line) => line.trim()).filter(Boolean)
      );
      const payload: RecipePayload = {
        title,
        description,
        ingredients: ingredientsList,
        instructions,
        image_url: finalImageUrl || 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?q=80&w=600&auto=format&fit=crop',
        servings: servings ? parseInt(servings) : null,
        prep_time_mins: editingRecipe?.prep_time_mins ?? null,
        cook_time_mins: editingRecipe?.cook_time_mins ?? null,
        source_url: sourceUrl.trim() || null,
        source_name: sourceName.trim() || null,
      };
      await onSave(payload, editingRecipe?.id);
      toast.success(editingRecipe ? 'Recipe updated!' : 'Recipe saved!');
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save recipe');
    } finally {
      setIsSaving(false);
      setIsUploadingImage(false);
    }
  }

  const savingLabel = isUploadingImage ? 'Uploading image...' : isSaving ? 'Saving...' : editingRecipe ? 'Update Recipe' : 'Save Recipe';

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogTrigger className="hidden" />
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto rounded-2xl w-[95vw] sm:w-full bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {editingRecipe ? 'Edit Recipe' : 'Add New Recipe'}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            {editingRecipe ? 'Update the details of your recipe.' : 'Import from a URL, snap a photo, or enter details manually.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">

          {/* Import section */}
          {!editingRecipe && (
            <div className="bg-zinc-100 dark:bg-zinc-800/60 p-4 rounded-xl space-y-3 border border-zinc-200 dark:border-zinc-700/50">
              {/* Tab switcher */}
              <div className="flex gap-1 bg-zinc-200 dark:bg-zinc-700/50 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setImportTab('url')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${importTab === 'url' ? 'bg-white dark:bg-zinc-800 shadow text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                  <ChefHat className="w-3.5 h-3.5" /> From URL
                </button>
                <button
                  type="button"
                  onClick={() => setImportTab('photo')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${importTab === 'photo' ? 'bg-white dark:bg-zinc-800 shadow text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                  <Camera className="w-3.5 h-3.5" /> From Photo
                </button>
              </div>

              {importTab === 'url' && (
                <div className="flex gap-2">
                  <Input
                    type="url"
                    value={extractUrl}
                    onChange={(e) => setExtractUrl(e.target.value)}
                    placeholder="https://..."
                    className="bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700"
                  />
                  <Button onClick={handleExtractUrl} disabled={isExtracting || !extractUrl} type="button" variant="secondary" className="whitespace-nowrap px-4 font-medium">
                    {isExtracting ? 'Extracting...' : 'Auto-Fill'}
                  </Button>
                </div>
              )}

              {importTab === 'photo' && (
                <div className="space-y-2">
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoSelect} />
                  {!photoPreview ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-28 border-2 border-dashed border-zinc-300 dark:border-zinc-600 rounded-xl flex flex-col items-center justify-center gap-2 text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
                    >
                      <Camera className="w-7 h-7" />
                      <span className="text-xs font-semibold">Tap to upload a photo or recipe card</span>
                    </button>
                  ) : (
                    <div className="relative">
                      <img src={photoPreview} alt="Recipe photo" className="w-full h-40 object-cover rounded-xl" />
                      <button
                        type="button"
                        onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                        className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {photoFile && (
                    <Button
                      type="button"
                      onClick={handlePhotoExtract}
                      disabled={isExtractingPhoto}
                      variant="secondary"
                      className="w-full font-medium"
                    >
                      {isExtractingPhoto ? 'Analysing photo...' : 'Extract Recipe from Photo'}
                    </Button>
                  )}
                </div>
              )}
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
              <Label className="font-semibold text-zinc-700 dark:text-zinc-300">Recipe Image</Label>
              <div className="flex gap-2">
                {imagePreview ? (
                  <div className="relative flex-1">
                    <img src={imagePreview} alt="Preview" className="h-8 w-full object-cover rounded-lg border border-zinc-200 dark:border-zinc-700" />
                    <button
                      type="button"
                      onClick={() => { setImageFile(null); setImagePreview(null); }}
                      className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-zinc-500 text-white hover:bg-zinc-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <Input id="image" type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="flex-1" />
                )}
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="shrink-0 p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-orange-500 hover:border-orange-400 transition-colors"
                  title="Upload image"
                >
                  <ImagePlus className="w-4 h-4" />
                </button>
                <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageSelect} />
              </div>
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

          {/* Source */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-3">
            <Label className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <Link className="w-4 h-4 text-zinc-400" /> Source <span className="text-xs font-normal text-zinc-400">optional</span>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="source-name" className="text-xs text-zinc-500 dark:text-zinc-400">Display name</Label>
                <Input id="source-name" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="e.g. NYT Cooking, Grandma's book" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="source-url" className="text-xs text-zinc-500 dark:text-zinc-400">URL (optional)</Label>
                <Input id="source-url" type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={isSaving || isUploadingImage} className="w-full bg-orange-500 hover:bg-orange-600 rounded-lg text-white font-semibold text-base h-11">
              {savingLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix: "data:image/jpeg;base64,"
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
