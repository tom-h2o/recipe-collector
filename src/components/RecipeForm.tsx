import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Link, Camera, ImagePlus, X, Plus, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, FileText, ClipboardPaste, Globe, PenLine, CircleCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseIngredients } from '@/lib/recipeUtils';
import { apiFetch } from '@/lib/api';
import { LANGUAGES } from '@/lib/constants';
import { MAX_EXTRACT_PHOTOS, encodePhotosForExtraction } from '@/lib/imageUtils';
import { imageKind } from '@/lib/imageKind';
import { uploadRecipeImage, attachRecipeImages } from '@/hooks/useRecipeImages';
import { VaultAnimation } from '@/components/VaultAnimation';
import type { RecipeImageSource } from '@/types';
import type { Recipe, Ingredient } from '@/types';

type RecipePayload = Omit<Recipe, 'id' | 'created_at' | 'tags' | 'is_favourite' | 'nutrition' | 'rating' | 'notes' | 'user_id'>;
type ImportKind = 'url' | 'photo' | 'pdf' | 'text';

/**
 * The dialog moves through steps rather than showing everything at once:
 * `choose` (the four ways to import, and one button to type a recipe in), one
 * step per way of importing, and `edit`, the full editor. While a recipe is
 * being read the step's content gives way to VaultAnimation; that is the only
 * progress shown (there used to be an overlay and a toast at the same time).
 * Editing an existing recipe opens straight on `edit`.
 */
type Step = 'choose' | ImportKind | 'edit';

/**
 * Mirrors MIN_EXTRACT_TEXT / MAX_EXTRACT_TEXT in api/_lib/schemas.ts, which is
 * what actually enforces them. Kept here only so the button is not offered for
 * a paste the server will refuse; `src` does not import from `api`.
 */
const MIN_PASTE_LENGTH = 30;
const MAX_PASTE_LENGTH = 20000;

const IMPORT_OPTIONS: { id: ImportKind; title: string; hint: string; icon: typeof Globe }[] = [
  { id: 'url', title: 'From a website', hint: 'Paste the link to a recipe page', icon: Globe },
  { id: 'photo', title: 'From photos', hint: 'Cookbook pages, recipe cards or screenshots', icon: Camera },
  { id: 'pdf', title: 'From a PDF', hint: 'A saved or scanned recipe', icon: FileText },
  { id: 'text', title: 'From text', hint: 'A recipe from a message or a note', icon: ClipboardPaste },
];

const STEP_COPY: Record<ImportKind, { title: string; description: string }> = {
  url: { title: 'From a website', description: 'Paste the link to the recipe page.' },
  photo: { title: 'From photos', description: `Up to ${MAX_EXTRACT_PHOTOS} pages of the same recipe, in order.` },
  pdf: { title: 'From a PDF', description: 'One recipe per PDF.' },
  text: { title: 'From text', description: 'Paste the ingredients and the steps, in any order.' },
};

interface Props {
  isOpen: boolean;
  editingRecipe: Recipe | null;
  onClose: () => void;
  /** Resolves to the saved recipe's id so uploaded photos can be attached to it. */
  onSave: (payload: RecipePayload, editingId?: string) => Promise<string | undefined>;
  userId?: string | null;
}

type UrlProblem = { code: 'site_blocked' | 'page_unavailable'; site: string; error: string };

/** What /api/extract answers with, whichever way the recipe came in. */
interface Extracted {
  title?: string;
  description?: string;
  servings?: number | null;
  prep_time_mins?: number | null;
  cook_time_mins?: number | null;
  instructions?: string;
  original_language?: string;
  ingredients?: unknown;
  image_url?: string;
  source_name?: string;
}

function domainFrom(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** How long the closed door and its tick stay before the editor opens. */
const DONE_PAUSE_MS = 900;

export function RecipeForm({ isOpen, editingRecipe, onClose, onSave, userId }: Props) {
  const [step, setStep] = useState<Step>(editingRecipe ? 'edit' : 'choose');
  const [extractUrl, setExtractUrl] = useState('');
  // A site that would not hand its page over (see describePageRefusal in
  // api/extract.ts). Shown under the link, with the ways in that do work.
  const [urlProblem, setUrlProblem] = useState<UrlProblem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reading in progress (which way), its finish, and what went wrong last time.
  const [reading, setReading] = useState<ImportKind | null>(null);
  const [readDone, setReadDone] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  /** Where the editor's contents were read from, for the note above it. */
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Photo import state — a recipe may span several pages, so this is a list
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PDF import state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Pasted-text import state
  const [pastedText, setPastedText] = useState('');

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
    // A read still running belongs to the dialog as it was: stop it.
    abortRef.current?.abort();
    abortRef.current = null;
    setReading(null); setReadDone(false); setImportError(null); setFilledFrom(null);
    setStep(editingRecipe ? 'edit' : 'choose');
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
      setExtractUrl(''); setSourceUrl(''); setSourceName(''); setUrlProblem(null);
      setOriginalLanguage(null);
      setPhotoFiles([]);
      setPhotoPreviews((prev) => { prev.forEach(URL.revokeObjectURL); return []; });
      setPdfFile(null);
      setPastedText('');
      setImageFile(null); setImagePreview(null);
    }
  }, [editingRecipe, isOpen]);

  function goTo(next: Step) {
    setImportError(null);
    setStep(next);
  }

  /** Choosing photos or a PDF opens the picker at once: that is the next thing anyone does. */
  function choose(kind: ImportKind) {
    goTo(kind);
    if (kind === 'photo' && photoFiles.length === 0) fileInputRef.current?.click();
    if (kind === 'pdf' && !pdfFile) pdfInputRef.current?.click();
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    // Allow re-picking the same file after a removal
    e.target.value = '';
    if (!selected.length) return;

    const room = MAX_EXTRACT_PHOTOS - photoFiles.length;
    if (room <= 0) {
      setImportError(`You can add at most ${MAX_EXTRACT_PHOTOS} photos.`);
      return;
    }
    const accepted = selected.slice(0, room);
    setImportError(accepted.length < selected.length
      ? `Only the first ${accepted.length} of ${selected.length} photos were added (at most ${MAX_EXTRACT_PHOTOS}).`
      : null);
    setPhotoFiles((prev) => [...prev, ...accepted]);
    setPhotoPreviews((prev) => [...prev, ...accepted.map((f) => URL.createObjectURL(f))]);
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(photoPreviews[index]);
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  function movePhoto(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= photoFiles.length) return;
    const swap = <T,>(arr: T[]) => {
      const next = [...arr];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    };
    setPhotoFiles(swap);
    setPhotoPreviews(swap);
  }

  /** Writes what was read into the editor's fields. */
  function applyExtracted(data: Extracted) {
    setTitle(data.title || '');
    setDescription(data.description || '');
    setServings(data.servings ? String(data.servings) : '');
    setPrepTime(data.prep_time_mins ? String(data.prep_time_mins) : '');
    setCookTime(data.cook_time_mins ? String(data.cook_time_mins) : '');
    setInstructions(data.instructions || '');
    setOriginalLanguage(data.original_language && data.original_language.length === 2 ? data.original_language : null);
    if (Array.isArray(data.ingredients)) setIngredients(parseIngredients(data.ingredients));
  }

  /**
   * One read, whichever way in: the animation while it runs, the editor when it
   * is done, and the reason inline in the step when it is not. Cancel aborts.
   */
  async function readRecipe(kind: ImportKind, makeBody: () => Promise<Record<string, unknown>>, onRead: (data: Extracted) => void, from: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setImportError(null);
    setUrlProblem(null);
    setReadDone(false);
    setReading(kind);
    try {
      const body = await makeBody();
      if (controller.signal.aborted) return;
      const res = await apiFetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({})) as Extracted & { error?: string; code?: string; site?: string };
      if (controller.signal.aborted) return;
      if (!res.ok) {
        if (kind === 'url' && (data.code === 'site_blocked' || data.code === 'page_unavailable')) {
          setUrlProblem({ code: data.code, site: data.site || domainFrom(extractUrl), error: data.error ?? '' });
          if (data.code === 'site_blocked') {
            // Whichever way the recipe comes in instead, it keeps its link.
            setSourceUrl(extractUrl);
            setSourceName((prev) => prev || domainFrom(extractUrl));
          }
          return;
        }
        throw new Error(data.error || 'The recipe could not be read. Please try again.');
      }
      applyExtracted(data);
      onRead(data);
      setFilledFrom(from);
      setReadDone(true);
      await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? DONE_PAUSE_MS / 3 : DONE_PAUSE_MS));
      if (controller.signal.aborted) return;
      setStep('edit');
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setImportError(err instanceof Error ? err.message : 'The recipe could not be read. Please try again.');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setReading(null);
        setReadDone(false);
      }
    }
  }

  function cancelReading() {
    abortRef.current?.abort();
    abortRef.current = null;
    setReading(null);
    setReadDone(false);
  }

  function close() {
    abortRef.current?.abort();
    onClose();
  }

  function handleExtractUrl() {
    if (!extractUrl) return;
    const url = extractUrl;
    return readRecipe('url', async () => ({ url }), (data) => {
      setImageUrl(data.image_url || '');
      setSourceUrl(url);
      setSourceName((prev) => prev || data.source_name || domainFrom(url));
    }, domainFrom(url) || 'the website');
  }

  function handlePhotoExtract() {
    if (!photoFiles.length) return;
    const files = photoFiles;
    const previews = photoPreviews;
    // The kind is read from the files as picked: encoding turns them all into JPEG.
    return readRecipe('photo', async () => {
      const [images, kind] = await Promise.all([encodePhotosForExtraction(files), imageKind(files)]);
      return { images, kind };
    }, () => {
      // The first photo becomes the recipe's picture.
      setImagePreview(previews[0] ?? null);
      setImageFile(files[0] ?? null);
    }, files.length === 1 ? 'your photo' : `your ${files.length} photos`);
  }

  function handlePdfExtract() {
    if (!pdfFile) return;
    const file = pdfFile;
    return readRecipe('pdf', async () => ({ pdfBase64: await fileToBase64(file) }), () => {}, file.name);
  }

  function handleTextExtract() {
    const text = pastedText.trim();
    if (text.length < MIN_PASTE_LENGTH) return;
    // The pasted text stays in the box: after a failure the person fixes it or
    // tries again, and should not have to find it twice.
    return readRecipe('text', async () => ({ text }), () => {}, 'your text');
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageUrl('');
  }


  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Every photo the user gave us is kept, not just the one used as the cover.
      // Extraction only ever saw downscaled copies; these are the full-size ones.
      const gallery: { url: string; storagePath: string | null; source: RecipeImageSource }[] = [];
      let finalImageUrl = imageUrl;

      if (photoFiles.length > 0 || imageFile) {
        setIsUploadingImage(true);
        const toUpload = photoFiles.length > 0 ? photoFiles : [imageFile as File];
        for (const file of toUpload) {
          const { url, storagePath } = await uploadRecipeImage(file);
          gallery.push({ url, storagePath, source: 'upload' });
        }
        // first uploaded becomes the cover unless one was already set by hand
        finalImageUrl = imageUrl || gallery[0].url;
        setIsUploadingImage(false);
      } else if (imageUrl) {
        // scraped from the source page during URL extraction
        gallery.push({ url: imageUrl, storagePath: null, source: 'website' });
      }

      const ingredientsList = ingredients.filter((i) => i.name.trim());
      const payload: RecipePayload = {
        title,
        description,
        ingredients: ingredientsList,
        instructions,
        // Save empty rather than a stock photo: every render site handles a
        // missing image, and an empty value lets the create path in
        // recipeStore auto-search a title-matched cover via /api/find-image.
        image_url: finalImageUrl,
        servings: servings ? parseInt(servings) : null,
        prep_time_mins: prepTime ? parseInt(prepTime) : null,
        cook_time_mins: cookTime ? parseInt(cookTime) : null,
        source_url: sourceUrl.trim() || null,
        source_name: sourceName.trim() || null,
        original_language: originalLanguage || null,
      };
      const savedId = await onSave(payload, editingRecipe?.id);

      if (savedId && userId && gallery.length > 0) {
        try {
          await attachRecipeImages(savedId, userId, gallery);
        } catch (err) {
          // The recipe itself saved; losing the gallery rows should not read as
          // a failed save, but the user should know the photos did not stick.
          toast.error(err instanceof Error ? err.message : 'Recipe saved, but the photos could not be attached.');
        }
      }

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

  const readingPhases: Record<ImportKind, string[]> = {
    url: [`Opening ${domainFrom(extractUrl) || 'the page'}…`, 'Finding the ingredients…', 'Writing down the steps…', 'Almost there…'],
    photo: [photoFiles.length > 1 ? `Looking at ${photoFiles.length} pages…` : 'Looking at the picture…', 'Reading the ingredients…', 'Writing down the steps…', 'Almost there…'],
    pdf: ['Opening the PDF…', 'Reading the ingredients…', 'Writing down the steps…', 'Almost there…'],
    text: ['Reading your text…', 'Sorting ingredients and steps…', 'Almost there…'],
  };

  const back = (to: Step) => (
    <button
      type="button"
      onClick={() => goTo(to)}
      className="-ml-2 mb-1 inline-flex items-center gap-0.5 px-2 py-1 rounded-full text-sm font-semibold text-sk-on-surface-variant dark:text-muted-foreground hover:bg-sk-surface-container dark:hover:bg-muted transition-colors"
    >
      <ChevronLeft className="w-4 h-4" /> Back
    </button>
  );

  const primary = 'w-full h-11 rounded-full font-semibold text-base bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground border-0';

  const importError_ = importError && (
    <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{importError}</p>
  );

  /** The frame every non-editor step shares: header, scrolling body, footer. */
  const frame = (header: ReactNode, body: ReactNode, footer?: ReactNode, onSubmit?: () => void) => (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}
      className="flex flex-col flex-1 overflow-hidden"
    >
      <div className="overflow-y-auto flex-1 p-6 pb-4">
        {header}
        <div className="space-y-3 pt-4">{body}</div>
      </div>
      {footer && <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 px-6 py-4">{footer}</div>}
    </form>
  );

  const heading = (titleText: string, descriptionText?: string) => (
    <DialogHeader>
      <DialogTitle className="text-2xl font-bold pr-10">{titleText}</DialogTitle>
      {descriptionText && <DialogDescription className="text-zinc-500">{descriptionText}</DialogDescription>}
    </DialogHeader>
  );

  let content: ReactNode;
  if (reading) {
    content = (
      <div className="flex-1 flex flex-col items-center justify-center py-14 min-h-[26rem]">
        <DialogTitle className="sr-only">Reading the recipe</DialogTitle>
        <VaultAnimation
          title={readDone ? 'Got it' : 'Reading the recipe'}
          phases={readingPhases[reading]}
          done={readDone}
          doneText="Have a look before you save it."
          onCancel={cancelReading}
        />
      </div>
    );
  } else if (step === 'choose') {
    content = frame(
      heading('Add a recipe', 'Let Speisekammer read it for you, or type it in yourself.'),
      <>
        <div className="space-y-2.5">
          {IMPORT_OPTIONS.map(({ id, title: optionTitle, hint, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => choose(id)}
              className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-left bg-sk-surface-low dark:bg-muted/50 ring-1 ring-inset ring-sk-outline-variant/40 dark:ring-white/5 hover:bg-sk-surface-container dark:hover:bg-muted transition-colors"
            >
              <span className="w-10 h-10 shrink-0 rounded-xl bg-sk-primary/10 dark:bg-primary/15 text-sk-primary dark:text-primary flex items-center justify-center">
                <Icon className="w-5 h-5" aria-hidden="true" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-sk-on-surface dark:text-foreground">{optionTitle}</span>
                <span className="block text-xs text-sk-on-surface-variant dark:text-muted-foreground">{hint}</span>
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-sk-outline dark:text-muted-foreground" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 py-1 text-xs font-medium text-sk-outline dark:text-muted-foreground" aria-hidden="true">
          <span className="h-px flex-1 bg-sk-outline-variant/60 dark:bg-border" /> or <span className="h-px flex-1 bg-sk-outline-variant/60 dark:bg-border" />
        </div>
        <Button type="button" variant="outline" onClick={() => goTo('edit')} className="w-full h-11 rounded-full font-semibold">
          <PenLine className="w-4 h-4 mr-1.5" aria-hidden="true" /> Enter it manually
        </Button>
      </>,
    );
  } else if (step === 'edit') {
    content = (
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <div className="overflow-y-auto flex-1 p-6 pb-2">
          {!editingRecipe && back('choose')}
          {heading(
            editingRecipe ? 'Edit recipe' : 'New recipe',
            editingRecipe ? 'Update the details of your recipe.' : filledFrom ? undefined : 'Fill in the details by hand.',
          )}
          <div className="space-y-4 py-2">
          {filledFrom && (
            <p className="flex items-start gap-2 rounded-xl bg-sk-primary-fixed/40 dark:bg-primary/15 px-3 py-2.5 text-sm text-sk-on-surface dark:text-foreground">
              <CircleCheck className="w-4 h-4 mt-0.5 shrink-0 text-sk-primary dark:text-primary" aria-hidden="true" />
              <span>Read from <b>{filledFrom}</b>. Check it over, then save.</span>
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="title" className="font-semibold text-zinc-700 dark:text-zinc-300">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Spaghetti Bolognese" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="servings" className="font-semibold text-zinc-700 dark:text-zinc-300">Servings</Label>
              <Input id="servings" type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="e.g. 4" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prep-time" className="font-semibold text-zinc-700 dark:text-zinc-300">Prep <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400">mins</span></Label>
              <Input id="prep-time" type="number" min="0" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} placeholder="15" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cook-time" className="font-semibold text-zinc-700 dark:text-zinc-300">Cook <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400">mins</span></Label>
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
                  className="shrink-0 p-2 rounded-lg border border-sk-outline-variant/40 dark:border-border text-sk-outline hover:text-sk-primary hover:border-sk-primary transition-colors"
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
                className="flex items-center gap-1 text-xs font-semibold text-sk-primary hover:text-sk-primary-container transition-colors"
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
                  {/* Indented under the name, inside the row: a margin on a
                      full-width input pushed it past the dialog's edge. */}
                  <div className="pl-9 pr-8">
                    <Input
                      value={ing.details || ''}
                      onChange={(e) => setIngredients((prev) => prev.map((x, j) => j === i ? { ...x, details: e.target.value } : x))}
                      placeholder="prep notes (optional)"
                      aria-label={`Prep notes for ingredient ${i + 1}`}
                      className="text-sm text-zinc-500 dark:text-zinc-400"
                    />
                  </div>
                </div>
              ))}
              {ingredients.length === 0 && (
                <button
                  type="button"
                  onClick={() => setIngredients([{ amount: '', name: '', details: '' }])}
                  className="w-full py-5 border-2 border-dashed border-sk-outline-variant dark:border-border rounded-xl text-sk-outline text-sm hover:border-sk-primary hover:text-sk-primary transition-colors flex items-center justify-center gap-2"
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
              <Link className="w-4 h-4 text-zinc-400" /> Source <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400">optional</span>
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <Button type="submit" disabled={isSaving || isUploadingImage} className={primary}>
            {savingLabel}
          </Button>
        </div>
      </form>
    );
  } else if (step === 'url') {
    content = frame(
      <>{back('choose')}{heading(STEP_COPY.url.title, STEP_COPY.url.description)}</>,
      <>
        <Label htmlFor="recipe-link" className="sr-only">Recipe link</Label>
        <Input
          id="recipe-link"
          type="url"
          inputMode="url"
          autoFocus
          value={extractUrl}
          onChange={(e) => { setExtractUrl(e.target.value); setUrlProblem(null); }}
          placeholder="https://…"
          className="h-11"
        />
        {importError_}
        {urlProblem && (
          <div role="alert" className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2 text-xs text-amber-950 dark:text-amber-100">
            <p className="font-semibold">{urlProblem.error}</p>
            {urlProblem.code === 'site_blocked' && (
              <>
                <p>Open the page in your browser and bring the recipe in another way. The link is kept as the recipe's source.</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><b>iPhone:</b> open the page in Safari, tap Share, then <b>Save page to Speisekammer</b> (set it up once under Settings → iPhone Shortcuts).</li>
                  <li><b>Text:</b> select the recipe on the page, copy it and paste it.</li>
                  <li><b>PDF</b> on an iPhone: take a screenshot in Safari, choose <b>Full Page</b>, and save it as a PDF to Files.</li>
                  <li><b>Photo:</b> screenshots of the recipe, several if it is long.</li>
                </ul>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" variant="outline" className="h-8 rounded-full text-xs" onClick={() => goTo('text')}>Paste text</Button>
                  <Button type="button" variant="outline" className="h-8 rounded-full text-xs" onClick={() => goTo('pdf')}>Upload PDF</Button>
                  <Button type="button" variant="outline" className="h-8 rounded-full text-xs" onClick={() => goTo('photo')}>Screenshots</Button>
                </div>
              </>
            )}
          </div>
        )}
      </>,
      <Button type="submit" disabled={!extractUrl} className={primary}>Read recipe</Button>,
      () => { void handleExtractUrl(); },
    );
  } else if (step === 'photo') {
    content = frame(
      <>{back('choose')}{heading(STEP_COPY.photo.title, STEP_COPY.photo.description)}</>,
      <>
        {!photoPreviews.length ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-36 border-2 border-dashed border-sk-outline-variant dark:border-border rounded-2xl flex flex-col items-center justify-center gap-2 text-sk-outline hover:border-sk-primary hover:text-sk-primary transition-colors"
          >
            <Camera className="w-7 h-7" />
            <span className="text-sm font-semibold">Choose photos or screenshots</span>
            <span className="text-xs">Up to {MAX_EXTRACT_PHOTOS} pages of the same recipe</span>
          </button>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {photoPreviews.map((preview, i) => (
                <div key={preview} className="relative group/photo aspect-[4/3]">
                  <img src={preview} alt={`Recipe page ${i + 1}`} className="w-full h-full object-cover rounded-lg" />
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold leading-none">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    aria-label={`Remove page ${i + 1}`}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  {photoPreviews.length > 1 && (
                    <div className="absolute bottom-1 right-1 flex gap-1">
                      <button
                        type="button"
                        onClick={() => movePhoto(i, -1)}
                        disabled={i === 0}
                        aria-label={`Move page ${i + 1} earlier`}
                        className="p-1 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 transition-colors"
                      >
                        <ChevronUp className="w-3 h-3 -rotate-90" />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePhoto(i, 1)}
                        disabled={i === photoPreviews.length - 1}
                        aria-label={`Move page ${i + 1} later`}
                        className="p-1 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 transition-colors"
                      >
                        <ChevronDown className="w-3 h-3 -rotate-90" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {photoPreviews.length < MAX_EXTRACT_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-[4/3] border-2 border-dashed border-sk-outline-variant dark:border-border rounded-lg flex flex-col items-center justify-center gap-1 text-sk-outline hover:border-sk-primary hover:text-sk-primary transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-[11px] font-semibold">Add page</span>
                </button>
              )}
            </div>
            <p className="text-xs text-sk-outline">
              {photoPreviews.length === 1
                ? 'Add more pages if this recipe continues on another page.'
                : `${photoPreviews.length} pages will be read together as one recipe, in this order.`}
            </p>
          </>
        )}
        {importError_}
      </>,
      <Button type="submit" disabled={photoFiles.length === 0} className={primary}>
        {photoFiles.length > 1 ? `Read recipe from ${photoFiles.length} pages` : 'Read recipe'}
      </Button>,
      () => { void handlePhotoExtract(); },
    );
  } else if (step === 'pdf') {
    content = frame(
      <>{back('choose')}{heading(STEP_COPY.pdf.title, STEP_COPY.pdf.description)}</>,
      <>
        {!pdfFile ? (
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            className="w-full h-36 border-2 border-dashed border-sk-outline-variant dark:border-border rounded-2xl flex flex-col items-center justify-center gap-2 text-sk-outline hover:border-sk-primary hover:text-sk-primary transition-colors"
          >
            <FileText className="w-7 h-7" />
            <span className="text-sm font-semibold">Choose a PDF</span>
          </button>
        ) : (
          <div className="flex items-center gap-3 px-3 py-3 bg-sk-surface-low dark:bg-muted/50 rounded-xl ring-1 ring-inset ring-sk-outline-variant/40 dark:ring-white/5">
            <FileText className="w-5 h-5 text-sk-primary shrink-0" />
            <span className="text-sm font-medium text-sk-on-surface dark:text-foreground flex-1 truncate">{pdfFile.name}</span>
            <button
              type="button"
              onClick={() => setPdfFile(null)}
              aria-label="Remove the PDF"
              className="shrink-0 p-1 rounded-full text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {importError_}
      </>,
      <Button type="submit" disabled={!pdfFile} className={primary}>Read recipe</Button>,
      () => { void handlePdfExtract(); },
    );
  } else {
    content = frame(
      <>{back('choose')}{heading(STEP_COPY.text.title, STEP_COPY.text.description)}</>,
      <>
        <Label htmlFor="paste-recipe" className="sr-only">Recipe text</Label>
        <Textarea
          id="paste-recipe"
          autoFocus
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          maxLength={MAX_PASTE_LENGTH}
          rows={8}
          placeholder="Paste a recipe from a message, a note or another app."
          className="min-h-40 max-h-72 overflow-y-auto"
        />
        {importError_}
      </>,
      <Button type="submit" disabled={pastedText.trim().length < MIN_PASTE_LENGTH} className={primary}>Read recipe</Button>,
      () => { void handleTextExtract(); },
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogTrigger className="hidden" />
      <DialogContent showCloseButton={false} className="sm:max-w-[580px] overflow-hidden rounded-2xl w-[95vw] sm:w-full bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-0 flex flex-col max-h-[var(--dialog-max-h)]">
        <button
          type="button"
          onClick={close}
          className="absolute top-3 right-3 z-20 p-2.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white transition-colors shadow-md ring-1 ring-white/20"
          title="Close"
          aria-label="Close"
        ><X className="w-4 h-4" /></button>

        {/* Always mounted, so choosing photos or a PDF can open the picker in the same tap. */}
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handlePhotoSelect} aria-hidden="true" tabIndex={-1} />
        <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { setPdfFile(e.target.files?.[0] ?? null); setImportError(null); }} aria-hidden="true" tabIndex={-1} />

        {content}
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
