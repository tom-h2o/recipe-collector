import { useEffect, useRef, useState } from 'react';
import { LogOut, User, KeyRound, Eye, EyeOff, X, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  user: SupabaseUser;
  onSignOut: () => void;
}

export function UserMenu({ user, onSignOut }: Props) {
  const { updatePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function openChangePassword() {
    setOpen(false);
    setNewPassword('');
    setError(null);
    setShowPassword(false);
    setShowChangePassword(true);
  }

  function openDeleteConfirm() {
    setOpen(false);
    setDeleteConfirmText('');
    setShowDeleteConfirm(true);
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
    setOpen(false);
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
  const displayName: string = user.user_metadata?.full_name || user.user_metadata?.name || '';
  const email = user.email ?? '';
  const initials = displayName
    ? displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : email[0]?.toUpperCase() ?? '?';

  const avatar = avatarUrl ? (
    <img src={avatarUrl} alt={displayName || email} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
  ) : (
    <span className="w-full h-full bg-sk-primary text-white text-sm font-bold flex items-center justify-center">
      {initials}
    </span>
  );

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-center w-9 h-9 rounded-full overflow-hidden ring-2 ring-transparent hover:ring-sk-primary transition-all focus:outline-none focus-visible:ring-sk-primary"
          aria-label="Account menu"
          aria-expanded={open}
        >
          {avatar}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-50 overflow-hidden">
            {/* User info */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden">
                {avatar}
              </div>
              <div className="min-w-0">
                {displayName && (
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate">{displayName}</p>
                )}
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{email}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="p-1.5">
              <button
                onClick={() => { setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
              >
                <User className="w-4 h-4 text-zinc-400" />
                <span className="flex-1">Signed in with {user.app_metadata?.provider === 'google' ? 'Google' : 'email'}</span>
              </button>
              <button
                onClick={openChangePassword}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
              >
                <KeyRound className="w-4 h-4 text-zinc-400" />
                Change password
              </button>
              <button
                onClick={handleExportRecipes}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
              >
                <Download className="w-4 h-4 text-zinc-400" />
                Export recipes (JSON)
              </button>

              <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />

              <button
                onClick={() => { setOpen(false); onSignOut(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
              >
                <LogOut className="w-4 h-4 text-zinc-400" />
                Sign out
              </button>
              <button
                onClick={openDeleteConfirm}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
              >
                <Trash2 className="w-4 h-4" />
                Delete account
              </button>
            </div>
          </div>
        )}
      </div>

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
                <Button type="submit" disabled={isSubmitting} className="flex-1 bg-sk-primary hover:bg-sk-primary-container text-white border-0">
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
