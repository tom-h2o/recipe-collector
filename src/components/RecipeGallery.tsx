import { useRef, useState } from 'react';
import { Images, ImagePlus, Star, Trash2, X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RecipeImage, RecipeImageSource } from '@/types';

const SOURCE_LABEL: Record<RecipeImageSource, string> = {
  upload: 'Uploaded',
  website: 'From website',
  stock: 'Stock photo',
};

interface Props {
  images: RecipeImage[];
  coverUrl: string | null;
  busy?: boolean;
  onAdd: (files: File[]) => void;
  onDelete: (image: RecipeImage) => void;
  onSetCover: (image: RecipeImage) => void;
}

/**
 * Every picture a recipe has ever had — the pages photographed during
 * extraction, whatever the source site provided, and anything added later.
 * Changing the cover only repoints the recipe at a different one; nothing is
 * removed unless the user deletes it explicitly.
 */
export function RecipeGallery({ images, coverUrl, busy, onAdd, onDelete, onSetCover }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RecipeImage | null>(null);

  const open = lightboxIndex !== null ? images[lightboxIndex] : null;
  const step = (delta: number) => {
    if (lightboxIndex === null || images.length === 0) return;
    setLightboxIndex((lightboxIndex + delta + images.length) % images.length);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold font-sans text-sk-on-surface dark:text-foreground">
          <Images className="w-4 h-4 text-sk-primary dark:text-primary" />
          Photos
          {images.length > 0 && (
            <span className="text-xs font-semibold text-sk-on-surface-variant dark:text-muted-foreground">
              {images.length}
            </span>
          )}
        </h3>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) onAdd(files);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="gap-1.5"
        >
          <ImagePlus className="w-3.5 h-3.5" /> Add photo
        </Button>
      </div>

      {images.length === 0 ? (
        <p className="text-xs font-sans text-sk-outline dark:text-muted-foreground">
          No photos yet. Add one to remember how yours turned out.
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((img, i) => {
            const isCover = !!coverUrl && img.url === coverUrl;
            return (
              <div key={img.id} className="relative group/photo aspect-[4/3]">
                <button
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  aria-label={`View photo ${i + 1} of ${images.length}`}
                  className="w-full h-full"
                >
                  <img src={img.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover rounded-lg" />
                </button>

                {isCover && (
                  <span className="absolute top-1 left-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-sk-primary text-white dark:text-primary-foreground text-[10px] font-bold leading-none">
                    <Star className="w-2.5 h-2.5 fill-current" /> Cover
                  </span>
                )}

                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-full bg-black/65 text-white text-[10px] font-semibold leading-none">
                  {SOURCE_LABEL[img.source]}
                </span>

                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/photo:opacity-100 focus-within:opacity-100 transition-opacity">
                  {!isCover && (
                    <button
                      type="button"
                      onClick={() => onSetCover(img)}
                      disabled={busy}
                      aria-label={`Use photo ${i + 1} as the recipe image`}
                      title="Use as recipe image"
                      className="p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                    >
                      <Star className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(img)}
                    disabled={busy}
                    aria-label={`Delete photo ${i + 1}`}
                    title="Delete photo"
                    className="p-1 rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-size view */}
      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') step(1);
            if (e.key === 'ArrowLeft') step(-1);
          }}
          role="presentation"
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            aria-label="Close photo"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); step(-1); }}
                aria-label="Previous photo"
                className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); step(1); }}
                aria-label="Next photo"
                className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          <img
            src={open.url}
            alt=""
            className="max-w-[90vw] max-h-[80vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          <div
            className="absolute bottom-4 flex items-center gap-3 text-white text-xs"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <span className="px-2 py-1 rounded-full bg-white/15">{SOURCE_LABEL[open.source]}</span>
            <span className="text-white/80">{lightboxIndex! + 1} / {images.length}</span>
            <a
              href={open.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Open original
            </a>
          </div>
        </div>
      )}

      {/* Deleting is explicit — replacing the cover never removes anything */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Delete this photo?</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {confirmDelete.storage_path
                ? 'The file is removed permanently and cannot be recovered.'
                : 'This removes the link from the gallery. The original stays on the website it came from.'}
              {coverUrl === confirmDelete.url && ' It is currently the recipe image, so pick another one afterwards.'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)} className="flex-1">Cancel</Button>
              <Button
                onClick={() => { onDelete(confirmDelete); setConfirmDelete(null); if (lightboxIndex !== null) setLightboxIndex(null); }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
