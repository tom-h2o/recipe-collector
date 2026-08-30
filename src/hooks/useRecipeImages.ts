import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { encodeForGallery } from '@/lib/imageUtils';
import type { RecipeImage, RecipeImageSource } from '@/types';

const BUCKET = 'recipe-images';

/** Uploads one photo to storage and returns its public URL and path. */
export async function uploadRecipeImage(file: File): Promise<{ url: string; storagePath: string }> {
  const blob = await encodeForGallery(file);
  const storagePath = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return { url: data.publicUrl, storagePath };
}

/**
 * Attaches images to a recipe. Used by the add/edit form, which cannot insert
 * gallery rows until the recipe it is saving exists and has an id.
 */
export async function attachRecipeImages(
  recipeId: string,
  userId: string,
  images: { url: string; storagePath: string | null; source: RecipeImageSource }[],
  startAt = 0,
): Promise<void> {
  if (images.length === 0) return;
  const rows = images.map((img, i) => ({
    recipe_id: recipeId,
    user_id: userId,
    url: img.url,
    storage_path: img.storagePath,
    source: img.source,
    sort_order: startAt + i,
  }));
  const { error } = await supabase.from('recipe_images').insert(rows);
  if (error) throw new Error(error.message);
}

export function useRecipeImages(recipeId: string | null, userId: string | null) {
  const [images, setImages] = useState<RecipeImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchImages = useCallback(async () => {
    if (!recipeId) { setImages([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('recipe_images')
      .select('*')
      .eq('recipe_id', recipeId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) toast.error('Could not load the recipe photos.');
    setImages((data as RecipeImage[]) ?? []);
    setLoading(false);
  }, [recipeId]);

  /** Adds photos taken after the fact — "here is how mine turned out". */
  const addImages = useCallback(
    async (files: File[]) => {
      if (!recipeId || !userId || files.length === 0) return;
      setBusy(true);
      const id = toast.loading(files.length === 1 ? 'Adding photo…' : `Adding ${files.length} photos…`);
      try {
        const uploaded = await Promise.all(
          files.map(async (file) => {
            const { url, storagePath } = await uploadRecipeImage(file);
            return { url, storagePath, source: 'upload' as const };
          }),
        );
        await attachRecipeImages(recipeId, userId, uploaded, images.length);
        await fetchImages();
        toast.success(files.length === 1 ? 'Photo added' : `${files.length} photos added`, { id });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not add the photos.', { id });
      } finally {
        setBusy(false);
      }
    },
    [recipeId, userId, images.length, fetchImages],
  );

  /**
   * Removes an image from the gallery, and the underlying file when we hold one.
   * External URLs have nothing to delete.
   */
  const deleteImage = useCallback(
    async (image: RecipeImage) => {
      setBusy(true);
      try {
        const { error } = await supabase.from('recipe_images').delete().eq('id', image.id);
        if (error) throw new Error(error.message);
        if (image.storage_path) {
          // A failure here leaves an orphaned file, which is not worth surfacing
          // to the user or blocking on.
          supabase.storage.from(BUCKET).remove([image.storage_path]).then(() => {}, () => {});
        }
        setImages((prev) => prev.filter((i) => i.id !== image.id));
        toast.success('Photo removed');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove the photo.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { images, loading, busy, fetchImages, addImages, deleteImage, setImages };
}
