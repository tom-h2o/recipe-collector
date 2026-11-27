import { useCallback, useRef, useState } from 'react';
import {
  LogOut, KeyRound, Eye, EyeOff, X, Download, Trash2, Sparkles, MessageSquare,
  Settings, Sun, Moon, ShieldCheck, UserRound, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AnchoredMenu } from '@/components/AnchoredMenu';
import { Label } from '@/components/ui/label';
import { FeedbackDialog } from '@/components/FeedbackDialog';
import { Sheet } from '@/components/Sheet';
import { cn } from '@/lib/utils';
import { displayNameOf, initialsOf, MAX_NAME_LENGTH } from '@/lib/displayName';

interface Props {
  user: SupabaseUser;
  /**
   * Where the avatar sits. `header`: top right on a computer, opening a menu
   * under it. `tab`: the last tab of the phone's bottom bar ("You"), opening
   * a sheet. Both offer the same entries.
   */
  variant: 'header' | 'tab';
  onSignOut: () => void;
  onOpenSettings: () => void;
  onOpenWhatsNew?: () => void;
  /** Dot on the avatar and the menu entry when there are unread release notes. */
  hasUnreadReleases?: boolean;
  /** The view on screen, added to a feedback report. */
  currentView?: string;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

const ROW = 'w-full flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-sans text-sk-on-surface dark:text-foreground hover:bg-sk-surface-low dark:hover:bg-muted transition-colors text-left';
const ROW_ICON = 'w-4 h-4 shrink-0 text-sk-outline dark:text-muted-foreground';

/**
 * The account: who is signed in, and everything that is about the person or
 * the app rather than about recipes (Settings, light or dark, the admin
 * dashboard, release notes, feedback, export, password, sign-out).
 *
 * These used to be spread over the top bar (theme, Settings, avatar) and the
 * tab bars (Admin), which left a phone's top bar with five buttons beside the
 * name. They are one list now, reached from the avatar.
 */
export function UserMenu({
  user, variant, onSignOut, onOpenSettings, onOpenWhatsNew, hasUnreadReleases = false, currentView,
  isAdmin = false, onOpenAdmin, isDark, onToggleTheme,
}: Props) {
  const { updatePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showName, setShowName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);

  /** Closes the list, then does the thing: no entry leaves the list open behind it. */
  const go = (action: () => void) => () => { setOpen(false); action(); };

  function openChangePassword() {
    setNewPassword('');
    setError(null);
    setShowPassword(false);
    setShowChangePassword(true);
  }

  function openDeleteConfirm() {
    setDeleteConfirmText('');
    setShowDeleteConfirm(true);
  }

  function openName() {
    setNameDraft(displayNameOf(user));
    setNameError(null);
    setShowName(true);
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingName(true);
    setNameError(null);
    try {
      // Kept on the account itself (user metadata), so it follows the person
      // to every device. USER_UPDATED then hands useAuth the new user.
      const { error: failure } = await supabase.auth.updateUser({ data: { full_name: nameDraft.trim() } });
      if (failure) { setNameError('The name could not be saved. Please try again.'); return; }
      toast.success(nameDraft.trim() ? 'Name saved.' : 'Name removed.');
      setShowName(false);
    } catch {
      setNameError('The name could not be saved. Please try again.');
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const { error } = await updatePassword(newPassword);
      if (error) { setError(error); return; }
      toast.success('Password updated!');
      setShowChangePassword(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleExportRecipes() {
    setShowExport(false);
    const id = toast.loading('Exporting recipes…');
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `speisekammer-recipes-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data?.length ?? 0} recipes`, { id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed', { id });
    }
  }

  async function handleDeleteAccount() {
    setIsDeleting(true);
    try {
      const res = await apiFetch('/api/account', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete account');
      }
      toast.success('Account deleted.');
      onSignOut();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  const avatarUrl: string | undefined = user.user_metadata?.avatar_url;
  const displayName = displayNameOf(user);
  const email = user.email ?? '';
  const initials = initialsOf(user);
  const viaGoogle = user.app_metadata?.provider === 'google';

  const avatar = avatarUrl ? (
    <img src={avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
  ) : (
    <span className="w-full h-full bg-sk-primary text-white dark:text-primary-foreground font-bold flex items-center justify-center">
      {initials}
    </span>
  );
  const label = hasUnreadReleases ? 'Account menu, new updates available' : 'Account menu';

  const entries = (
    <>
      {/* Who is signed in. Not a button: it used to be drawn as one. */}
      <div className="flex items-center gap-3 px-3 pt-1 pb-3">
        <div className="shrink-0 w-11 h-11 rounded-full overflow-hidden text-base">{avatar}</div>
        <div className="min-w-0">
          {displayName && (
            <p className="text-sm font-semibold text-sk-on-surface dark:text-foreground truncate">{displayName}</p>
          )}
          <p className="text-xs text-sk-on-surface-variant dark:text-muted-foreground truncate">{email}</p>
          {viaGoogle && (
            <p className="text-xs text-sk-on-surface-variant dark:text-muted-foreground">Signed in with Google</p>
          )}
        </div>
      </div>

      <div className="border-t border-sk-outline-variant/40 dark:border-border pt-1.5">
        <button type="button" onClick={go(openName)} className={ROW}>
          <UserRound className={ROW_ICON} />
          <span className="flex-1">Your name</span>
          <span className="max-w-[45%] truncate text-sk-on-surface-variant dark:text-muted-foreground">{displayName || 'Add'}</span>
          <ChevronRight className="w-4 h-4 shrink-0 text-sk-outline-variant dark:text-muted-foreground/50" aria-hidden="true" />
        </button>
        <button type="button" onClick={go(onOpenSettings)} className={ROW} title="Settings">
          <Settings className={ROW_ICON} />
          Settings
        </button>
        {/* Stays open: the change is visible behind it, and may be undone at once. */}
        <button
          type="button"
          role="switch"
          aria-checked={isDark}
          onClick={onToggleTheme}
          className={ROW}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Moon className={ROW_ICON} /> : <Sun className={ROW_ICON} />}
          <span className="flex-1">Dark mode</span>
          <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${isDark ? 'bg-sk-primary dark:bg-primary' : 'bg-sk-outline-variant dark:bg-muted'}`}>
            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-4' : ''}`} />
          </span>
        </button>
        {isAdmin && onOpenAdmin && (
          <button type="button" onClick={go(onOpenAdmin)} className={ROW}>
            <ShieldCheck className={ROW_ICON} />
            Admin
          </button>
        )}
      </div>

      <div className="mt-1.5 border-t border-sk-outline-variant/40 dark:border-border pt-1.5">
        {onOpenWhatsNew && (
          <button type="button" onClick={go(onOpenWhatsNew)} className={ROW}>
            <Sparkles className={ROW_ICON} />
            <span className="flex-1">What's new</span>
            {hasUnreadReleases && (
              <span className="w-2 h-2 rounded-full bg-sk-primary shrink-0" aria-label="unread updates" />
            )}
          </button>
        )}
        <button type="button" onClick={go(() => setShowFeedback(true))} className={ROW}>
          <MessageSquare className={ROW_ICON} />
          Send feedback
        </button>
        <button type="button" onClick={go(() => setShowExport(true))} className={ROW}>
          <Download className={ROW_ICON} />
          Export recipes
        </button>
        <button type="button" onClick={go(openChangePassword)} className={ROW}>
          <KeyRound className={ROW_ICON} />
          Change password
        </button>
      </div>

      <div className="mt-1.5 border-t border-sk-outline-variant/40 dark:border-border pt-1.5">
        <button type="button" onClick={go(onSignOut)} className={ROW}>
          <LogOut className={ROW_ICON} />
          Sign out
        </button>
        <button type="button" onClick={go(openDeleteConfirm)} className={cn(ROW, 'text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20')}>
          <Trash2 className="w-4 h-4 shrink-0" />
          Delete account
        </button>
      </div>
    </>
  );

  return (
    <>
      {variant === 'header' ? (
        <div className="relative hidden lg:block">
          <button
            ref={anchor}
            onClick={() => setOpen((v) => !v)}
            className="relative flex items-center justify-center w-10 h-10 rounded-full overflow-hidden text-sm ring-2 ring-transparent hover:ring-sk-primary transition-all focus:outline-none focus-visible:ring-sk-primary"
            aria-label={label}
            aria-expanded={open}
          >
            {avatar}
          </button>
          {hasUnreadReleases && (
            // Outside the button so `overflow-hidden` on the avatar cannot clip it.
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sk-primary ring-2 ring-white dark:ring-zinc-900"
            />
          )}
          {/* Through AnchoredMenu (a portal), not inside the header: the header
              is glass itself, and a backdrop-filter inside another one can only
              blur what lies within its parent. */}
          <AnchoredMenu
            open={open}
            onClose={close}
            anchorRef={anchor}
            className="w-72 glass glass-menu rounded-2xl p-2 animate-in fade-in zoom-in-95 duration-200"
          >
            {entries}
          </AnchoredMenu>
        </div>
      ) : (
        <>
          {/* A tab like the others, so it takes its share of the bar. It is
              "current" while the admin dashboard is open, which is reached
              from here. */}
          <button
            onClick={() => setOpen(true)}
            aria-label={label}
            aria-haspopup="dialog"
            aria-current={currentView === 'admin' ? 'page' : undefined}
            className={`relative z-10 flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 rounded-full transition-colors ${
              currentView === 'admin' ? 'text-sk-primary dark:text-primary' : 'text-sk-on-surface-variant dark:text-muted-foreground'
            }`}
          >
            <span className="relative block w-5 h-5">
              <span className="block w-full h-full rounded-full overflow-hidden text-[10px] leading-none">{avatar}</span>
              {hasUnreadReleases && (
                <span aria-hidden="true" className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-sk-primary ring-2 ring-white dark:ring-zinc-900" />
              )}
            </span>
            <span className="text-[10px] font-semibold font-sans">You</span>
          </button>
          <Sheet open={open} onClose={close} title="You" className="[&>div:last-child]:px-2">
            {entries}
          </Sheet>
        </>
      )}

      <FeedbackDialog isOpen={showFeedback} onClose={() => setShowFeedback(false)} view={currentView} />

      <Sheet
        open={showName}
        onClose={() => setShowName(false)}
        title="Your name"
        description="Shown in your account and used for the letters on your avatar."
        initialFocus={nameInput}
      >
        <form onSubmit={handleSaveName} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`display-name-${variant}`} className="font-sans font-semibold text-sk-on-surface-variant dark:text-muted-foreground text-xs uppercase tracking-widest">
              Name
            </Label>
            <Input
              id={`display-name-${variant}`}
              ref={nameInput}
              value={nameDraft}
              onChange={(e) => { setNameDraft(e.target.value); setNameError(null); }}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="name"
              placeholder="e.g. Anna Schmidt"
              className="bg-sk-surface-highest dark:bg-input border-0 focus-visible:ring-sk-primary/30 rounded-xl"
            />
          </div>
          {nameError && <p role="alert" className="text-sm text-destructive">{nameError}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setShowName(false)} className="flex-1 rounded-full">Cancel</Button>
            <Button type="submit" disabled={isSavingName} className="flex-1 rounded-full bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground border-0">
              {isSavingName ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Sheet>

      <Sheet
        open={showExport}
        onClose={() => setShowExport(false)}
        title="Export your recipes?"
        description="Downloads one file (JSON) with all your own recipes: text, tags, nutrition and notes. Photo files are not in it, only their addresses."
      >
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setShowExport(false)} className="flex-1 rounded-full">Cancel</Button>
          <Button type="button" onClick={handleExportRecipes} className="flex-1 rounded-full bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground border-0">
            Export
          </Button>
        </div>
      </Sheet>

      {/* Change password modal */}
      {showChangePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Change password</h2>
              <button
                onClick={() => setShowChangePassword(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="font-semibold text-zinc-700 dark:text-zinc-300">New password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    autoFocus
                    className={`pr-10 ${error ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setShowChangePassword(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="flex-1 bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground border-0">
                  {isSubmitting ? 'Saving…' : 'Save password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete account confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-red-600 dark:text-red-400">Delete account</h2>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              This will permanently delete your account and all your recipes, meal plans, and settings. This cannot be undone.
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Type <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">delete</span> to confirm.
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="delete"
              autoFocus
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setShowDeleteConfirm(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                type="button"
                disabled={deleteConfirmText !== 'delete' || isDeleting}
                onClick={handleDeleteAccount}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0"
              >
                {isDeleting ? 'Deleting…' : 'Delete account'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
