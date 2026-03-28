import { useEffect, useRef, useState } from 'react';
import { LogOut, User } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface Props {
  user: SupabaseUser;
  onSignOut: () => void;
}

export function UserMenu({ user, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
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

  const avatarUrl: string | undefined = user.user_metadata?.avatar_url;
  const displayName: string = user.user_metadata?.full_name || user.user_metadata?.name || '';
  const email = user.email ?? '';
  const initials = displayName
    ? displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : email[0]?.toUpperCase() ?? '?';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-9 h-9 rounded-full overflow-hidden ring-2 ring-transparent hover:ring-orange-400 transition-all focus:outline-none focus-visible:ring-orange-400"
        aria-label="Account menu"
        aria-expanded={open}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName || email} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="w-full h-full bg-orange-500 text-white text-sm font-bold flex items-center justify-center">
            {initials}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-50 overflow-hidden">
          {/* User info */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName || email} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="w-full h-full bg-orange-500 text-white text-sm font-bold flex items-center justify-center">
                  {initials}
                </span>
              )}
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
              onClick={() => { setOpen(false); onSignOut(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
            >
              <User className="w-4 h-4 text-zinc-400" />
              <span className="flex-1">Signed in with {user.app_metadata?.provider === 'google' ? 'Google' : 'email'}</span>
            </button>
            <button
              onClick={() => { setOpen(false); onSignOut(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
