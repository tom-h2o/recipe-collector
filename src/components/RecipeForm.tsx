import { useState, useEffect, useRef } from 'react';
import { ChefHat, Link, Camera, ImagePlus, X, Plus, ChevronUp, ChevronDown, Wand2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseIngredients } from '@/lib/recipeUtils';
import { supabase } from '@/lib/supabase';
import { LANGUAGES } from '@/lib/constants';
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
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [instructions, setInstructions] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [servings, setServings] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [originalLanguage, setOriginalLanguage] = useState<string | null>(null);

  useEffect(() => {
    if (editingRecipe) {
      setTitle(editingRecipe.title);
      setDescription(editingRecipe.description || '');
      setIngredients(parseIngredients(editingRecipe.ingredients));
      setInstructions(editingRecipe.instructions || '');
      setImageUrl(editingRecipe.image_url || '');
      setServings(editingRecipe.servings ? String(editingRecipe.servings) : '');
      setPrepTime(editingRecipe.prep_time_mins ? String(editingRecipe.prep_time_mins) : '');
      setCookTime(editingRecipe.cook_time_mins ? String(editingRecipe.cook_time_mins) : '');
      setSourceUrl(editingRecipe.source_url || '');
      setSourceName(editingRecipe.source_name || '');
      setOriginalLanguage(editingRecipe.original_language || null);
    } else {
      setTitle(''); setDescription(''); setIngredients([]);
      setInstructions(''); setImageUrl(''); setServings('');
      setPrepTime(''); setCookTime('');
      setExtractUrl(''); setSourceUrl(''); setSourceName('');
      setOriginalLanguage(null);
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
      setPrepTime(data.prep_time_mins ? String(data.prep_time_mins) : '');
      setCookTime(data.cook_time_mins ? String(data.cook_time_mins) : '');
      setInstructions(data.instructions || '');
      setOriginalLanguage(data.original_language && data.original_language.length === 2 ? data.original_language : null);
      if (Array.isArray(data.ingredients)) {
        setIngredients(parseIngredients(data.ingredients));
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
      setPrepTime(data.prep_time_mins ? String(data.prep_time_mins) : '');
      setCookTime(data.cook_time_mins ? String(data.cook_time_mins) : '');
      setImageUrl(data.image_url || '');
      setInstructions(data.instructions || '');
      setSourceUrl(extractUrl);
      setSourceName((prev) => prev || domainFrom(extractUrl));
      setOriginalLanguage(data.original_language && data.original_language.length === 2 ? data.original_language : null);
      if (Array.isArray(data.ingredients)) {
        setIngredients(parseIngredients(data.ingredients));
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

      const ingredientsList = ingredients.filter((i) => i.name.trim());
      const payload: RecipePayload = {
        title,
        description,
        ingredients: ingredientsList,
        instructions,
        image_url: finalImageUrl || 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?q=80&w=600&auto=format&fit=crop',
        servings: servings ? parseInt(servings) : null,
        prep_time_mins: prepTime ? parseInt(prepTime) : null,
        cook_time_mins: cookTime ? parseInt(cookTime) : null,
        source_url: sourceUrl.trim() || null,
        source_name: sourceName.trim() || null,
        original_language: originalLanguage || null,
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
      <DialogContent showCloseButton={false} className="sm:max-w-[580px] overflow-hidden rounded-2xl w-[95vw] sm:w-full bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-0 flex flex-col max-h-[90vh]">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-1.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white transition-colors shadow-md ring-1 ring-white/20"
          title="Close"
        ><X className="w-4 h-4" /></button>

        {/* Magic extraction overlay */}
        {(isExtracting || isExtractingPhoto) && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl overflow-hidden">
            {/* Blurred background */}
            <div className="absolute inset-0 backdrop-blur-md bg-white/70 dark:bg-zinc-900/70" />

            {/* Animated content */}
            <div className="relative flex flex-col items-center gap-6 px-8 text-center">
              {/* Orbiting sparkles */}
              <div className="relative w-28 h-28">
                {/* Orbit ring */}
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-orange-300/50 dark:border-orange-500/30 animate-spin" style={{ animationDuration: '6s' }} />

                {/* Orbiting dots */}
                {[0, 60, 120, 180, 240, 300].map((deg, i) => (
                  <div
                    key={i}
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      top: '50%',
                      left: '50%',
                      transform: `rotate(${deg}deg) translateX(52px) translateY(-50%)`,
                      background: `hsl(${20 + i * 12}, 90%, 60%)`,
                      animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}

                {/* Center chef hat */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/40"
                      style={{
                        background: 'linear-gradient(135deg, #f97316, #ea580c)',
                        animation: 'pulse 2s ease-in-out infinite',
                      }}
                    >
                      <ChefHat className="w-8 h-8 text-white" strokeWidth={1.5} />
                    </div>
                    {/* Wand badge */}
                    <div
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-md"
                      style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}
                    >
                      <Wand2 className="w-3 h-3 text-white" strokeWidth={2} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating sparkle icons */}
              <div className="absolute inset-0 pointer-events-none">
                {[
                  { top: '10%', left: '15%', delay: '0s', size: 'w-4 h-4' },
                  { top: '20%', right: '12%', delay: '0.5s', size: 'w-3 h-3' },
                  { bottom: '30%', left: '10%', delay: '0.8s', size: 'w-3 h-3' },
                  { bottom: '20%', right: '15%', delay: '0.3s', size: 'w-4 h-4' },
                  { top: '50%', left: '5%', delay: '1.1s', size: 'w-2 h-2' },
                  { top: '40%', right: '5%', delay: '0.7s', size: 'w-2 h-2' },
                ].map((s, i) => (
                  <Sparkles
                    key={i}
                    className={`${s.size} text-orange-400 absolute`}
                    style={{
                      top: s.top,
                      left: (s as { left?: string }).left,
                      right: (s as { right?: string }).right,
                      bottom: s.bottom,
                      animation: `pulse 1.8s ease-in-out ${s.delay} infinite`,
                    }}
                  />
                ))}
              </div>

              {/* Text */}
              <div className="space-y-1">
                <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {isExtractingPhoto ? 'Reading your photo...' : 'Casting spell...'}
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {isExtractingPhoto ? 'Gemini is analysing the image' : 'Gemini is extracting the recipe'}
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <div className="overflow-y-auto flex-1 p-6 pb-2">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {editingRecipe ? 'Edit Recipe' : 'Add New Recipe'}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            {editingRecipe ? 'Update the details of your recipe.' : 'Import from a URL, snap a photo, or enter details manually.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">

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
                  <Button onClick={handleExtractUrl} disabled={isExtracting || !extractUrl} type="button" variant="default" className="whitespace-nowrap px-4 font-medium bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-md">
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
                      variant="default"
                      className="w-full font-medium bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-md"
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
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="servings" className="font-semibold text-zinc-700 dark:text-zinc-300">Servings</Label>
              <Input id="servings" type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="e.g. 4" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prep-time" className="font-semibold text-zinc-700 dark:text-zinc-300">Prep <span className="text-xs font-normal text-zinc-400">mins</span></Label>
              <Input id="prep-time" type="number" min="0" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} placeholder="15" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cook-time" className="font-semibold text-zinc-700 dark:text-zinc-300">Cook <span className="text-xs font-normal text-zinc-400">mins</span></Label>
              <Input id="cook-time" type="number" min="0" value={cookTime} onChange={(e) => setCookTime(e.target.value)} placeholder="30" />
            </div>
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
          <div className="space-y-2">
            <Label htmlFor="description" className="font-semibold text-zinc-700 dark:text-zinc-300">Description (optional)</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A quick summary of the dish..." className="min-h-[70px]" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-zinc-700 dark:text-zinc-300">Ingredients</Label>
              <button
                type="button"
                onClick={() => setIngredients((prev) => [...prev, { amount: '', name: '', details: '' }])}
                className="flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-600 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {ingredients.map((ing, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex gap-1.5 items-center">
                    <div className="flex flex-col shrink-0">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => setIngredients((prev) => { const a = [...prev]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; })}
                        className="p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 disabled:opacity-0 transition-colors touch-manipulation"
                      ><ChevronUp className="w-3.5 h-3.5" /></button>
                      <button
                        type="button"
                        disabled={i === ingredients.length - 1}
                        onClick={() => setIngredients((prev) => { const a = [...prev]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a; })}
                        className="p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 disabled:opacity-0 transition-colors touch-manipulation"
                      ><ChevronDown className="w-3.5 h-3.5" /></button>
                    </div>
                    <Input
                      value={ing.amount}
                      onChange={(e) => setIngredients((prev) => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                      placeholder="qty"
                      className="w-14 shrink-0 text-sm"
                    />
                    <Input
                      value={ing.name}
                      onChange={(e) => setIngredients((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      placeholder="ingredient"
                      className="flex-1 min-w-0 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setIngredients((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 p-1.5 text-zinc-400 hover:text-red-500 transition-colors touch-manipulation"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <Input
                    value={ing.details || ''}
                    onChange={(e) => setIngredients((prev) => prev.map((x, j) => j === i ? { ...x, details: e.target.value } : x))}
                    placeholder="prep notes (optional)"
                    className="ml-9 text-sm text-zinc-500 dark:text-zinc-400"
                  />
                </div>
              ))}
              {ingredients.length === 0 && (
                <button
                  type="button"
                  onClick={() => setIngredients([{ amount: '', name: '', details: '' }])}
                  className="w-full py-5 border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-400 text-sm hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add first ingredient
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="instructions" className="font-semibold text-zinc-700 dark:text-zinc-300">Instructions</Label>
            <Textarea id="instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Step by step instructions..." required className="min-h-[120px]" />
          </div>

          {/* Original Language */}
          <div className="space-y-2">
            <Label htmlFor="original-language" className="font-semibold text-zinc-700 dark:text-zinc-300">Original Language {originalLanguage && `(${originalLanguage})`}</Label>
            <Select value={originalLanguage ?? ''} onValueChange={(v) => setOriginalLanguage(v && v.length > 0 ? v : null)}>
              <SelectTrigger id="original-language" className="w-full">
                <SelectValue placeholder="Auto-detected language..." />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.flag} {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Language the recipe is written in. Auto-detected during extraction, but can be corrected here.</p>
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

        </div>
        </div>

        {/* Sticky save footer */}
        <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 px-6 py-4">
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
