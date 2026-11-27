import { useRef, useState } from 'react';
import { FolderOpen, Pencil, Plus, Trash2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/Sheet';
import { addChipClass, chipClass } from '@/lib/tags';
import { tn, useT } from '@/i18n';
import type { Collection, RecipeCollection } from '@/types';

interface Props {
  collections: Collection[];
  memberships: RecipeCollection[];
  activeCollectionId: string | null;
  onChange: (id: string | null) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const MAX_COLLECTION_NAME = 40;
const FIELD = 'bg-sk-surface-highest dark:bg-input border-0 focus-visible:ring-sk-primary/30 rounded-xl';
const PRIMARY = 'rounded-full bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground border-0';

/**
 * The vault's collections: one row of chips to choose from, a "+" that asks
 * for a name in a sheet, and "Edit" for renaming and deleting.
 *
 * The row used to wrap onto two lines, with a pencil and a bin beside every
 * chip that only appeared on mouse hover: on a phone they could not be
 * reached at all, and the bin deleted without asking. Editing is its own
 * sheet now, and deleting asks first.
 */
export function CollectionBar({ collections, memberships, activeCollectionId, onChange, onCreate, onRename, onDelete }: Props) {
  const t = useT();
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Inside the Edit sheet: the collection being renamed, or about to be deleted.
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<Collection | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  const countOf = (id: string) => memberships.filter((m) => m.collection_id === id).length;

  function closeManage() {
    setManaging(false);
    setRenaming(null);
    setDeleting(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(value);
      setName('');
      setCreating(false);
    } catch {
      setError(t('The collection could not be created. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming || !renaming.name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRename(renaming.id, renaming.name.trim());
      setRenaming(null);
    } catch {
      setError(t('The name could not be saved. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleting || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(deleting.id);
      setDeleting(null);
    } catch {
      setError(t('The collection could not be deleted. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* One line that scrolls sideways on a phone, from the screen's edge;
          from sm there is room to wrap. */}
      <div role="group" aria-label={t('Collections')} className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
        <FolderOpen className="w-4 h-4 text-sk-outline dark:text-muted-foreground shrink-0" aria-hidden="true" />
        {collections.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(activeCollectionId === c.id ? null : c.id)}
            aria-pressed={activeCollectionId === c.id}
            className={chipClass(activeCollectionId === c.id)}
          >
            {c.name}
            <span className="text-[11px] tabular-nums opacity-60">{countOf(c.id)}</span>
          </button>
        ))}
        <button type="button" onClick={() => { setName(''); setError(null); setCreating(true); }} className={addChipClass()} aria-label={t('New collection')}>
          <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {/* Named while there are none yet; a bare + once the row has chips. */}
          {collections.length === 0 && t('New collection')}
        </button>
        {collections.length > 0 && (
          <button type="button" onClick={() => { setError(null); setManaging(true); }} className={chipClass(false)} aria-label={t('Edit collections')}>
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {t('Edit')}
          </button>
        )}
      </div>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title={t('New collection')}
        description={t('A named group of recipes, such as “Weeknight” or “For guests”. Add recipes to it from a recipe’s ⋯ menu.')}
        initialFocus={nameInput}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            ref={nameInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_COLLECTION_NAME}
            aria-label={t('Collection name')}
            placeholder={t('Collection name')}
            className={FIELD}
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setCreating(false)} className="flex-1 rounded-full">{t('Cancel')}</Button>
            <Button type="submit" disabled={!name.trim() || busy} className={`flex-1 ${PRIMARY}`}>
              {busy ? t('Creating…') : t('Create')}
            </Button>
          </div>
        </form>
      </Sheet>

      <Sheet
        open={managing}
        onClose={closeManage}
        title={deleting ? t('Delete “{name}”?', { name: deleting.name }) : t('Collections')}
        description={deleting
          ? (countOf(deleting.id) > 0
            ? tn(countOf(deleting.id), 'Only the collection goes. Its recipe stays in your vault.', 'Only the collection goes. Its {n} recipes stay in your vault.')
            : t('It has no recipes in it.'))
          : t('Rename or delete a collection. Recipes are never deleted with it.')}
      >
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        {deleting ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleting(null)} className="flex-1 rounded-full">{t('Keep it')}</Button>
            <Button type="button" onClick={handleDelete} disabled={busy} className="flex-1 rounded-full bg-destructive hover:bg-destructive/90 text-white border-0">
              {busy ? t('Deleting…') : t('Delete')}
            </Button>
          </div>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {collections.map((c) => (
              <li key={c.id}>
                {renaming?.id === c.id ? (
                  <form onSubmit={handleRename} className="flex items-center gap-2 px-2 py-1">
                    <Input
                      autoFocus
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: c.id, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }}
                      maxLength={MAX_COLLECTION_NAME}
                      aria-label={t('New name for {name}', { name: c.name })}
                      className={`${FIELD} flex-1 min-w-0`}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setRenaming(null)} className="rounded-full">{t('Cancel')}</Button>
                    <Button type="submit" size="sm" disabled={!renaming.name.trim() || busy} className={PRIMARY}>{t('Save')}</Button>
                  </form>
                ) : (
                  <div className="flex items-center gap-1 pl-3 pr-1 min-h-12 rounded-xl">
                    <span className="flex-1 min-w-0 truncate text-sm font-sans text-sk-on-surface dark:text-foreground">{c.name}</span>
                    <span className="text-xs tabular-nums text-sk-on-surface-variant dark:text-muted-foreground mr-1">
                      {tn(countOf(c.id), '{n} recipe', '{n} recipes')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRenaming({ id: c.id, name: c.name })}
                      aria-label={t('Rename {name}', { name: c.name })}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-sk-outline dark:text-muted-foreground hover:bg-sk-surface-low dark:hover:bg-muted hover:text-sk-primary dark:hover:text-primary transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(c)}
                      aria-label={t('Delete {name}', { name: c.name })}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-sk-outline dark:text-muted-foreground hover:bg-destructive/8 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
