import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

/**
 * Whether the signed-in person is the admin, as the server decides it
 * (GET /api/account?tab=whoami, api/_lib/supabase.ts isAdminIdentity).
 *
 * It used to compare the address against VITE_ADMIN_EMAIL, which put the
 * admin's address into the code every visitor downloads. Showing or hiding
 * the admin controls is only a courtesy either way: every admin route checks
 * for itself. Until the answer arrives, and on any failure, the answer is no.
 */
export function useIsAdmin(userId: string | null | undefined): boolean {
  const [answer, setAnswer] = useState<{ userId: string; isAdmin: boolean } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    apiFetch('/api/account?tab=whoami')
      .then(async (res) => (res.ok ? ((await res.json()) as { isAdmin?: unknown }) : null))
      .then((body) => { if (!cancelled) setAnswer({ userId, isAdmin: body?.isAdmin === true }); })
      .catch(() => { if (!cancelled) setAnswer({ userId, isAdmin: false }); });
    return () => { cancelled = true; };
  }, [userId]);

  // An answer about somebody else (the previous account) counts for nothing.
  return !!userId && answer?.userId === userId && answer.isAdmin;
}
