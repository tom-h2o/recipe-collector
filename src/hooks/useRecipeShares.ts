import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { RecipeShare, Contact, Recipe } from '@/types';

export function useRecipeShares(userId?: string | null, userEmail?: string | null) {
  const [inboxShares, setInboxShares] = useState<RecipeShare[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const fetchInbox = useCallback(async () => {
    if (!userEmail) { setInboxShares([]); return; }
    const { data } = await supabase
      .from('recipe_shares')
      .select('*')
      .eq('recipient_email', userEmail.toLowerCase())
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (data) setInboxShares(data as RecipeShare[]);
  }, [userEmail]);

  const fetchContacts = useCallback(async () => {
    if (!userId) { setContacts([]); return; }
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .order('contact_email', { ascending: true });
    if (data) setContacts(data as Contact[]);
  }, [userId]);

  const sendShare = useCallback(async (recipe: Recipe, recipientEmail: string, senderEmail: string): Promise<boolean> => {
    if (!userId) return false;
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          recipeId: recipe.id,
          recipientEmail,
          senderUserId: userId,
          senderEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Failed to send recipe.'); return false; }
      toast.success(`Recipe sent to ${recipientEmail}!`);
      // Refresh contacts in background
      fetchContacts();
      return true;
    } catch {
      toast.error('Failed to send recipe. Check your connection.');
      return false;
    }
  }, [userId, fetchContacts]);

  const acceptShare = useCallback(async (share: RecipeShare, recipientEmail: string): Promise<string | null> => {
    if (!userId) return null;
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept',
          shareId: share.id,
          recipientUserId: userId,
          recipientEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Failed to accept recipe.'); return null; }
      setInboxShares((prev) => prev.filter((s) => s.id !== share.id));
      toast.success(`"${share.recipe_title}" added to your vault!`);
      return data.newRecipeId ?? null;
    } catch {
      toast.error('Failed to accept recipe. Check your connection.');
      return null;
    }
  }, [userId]);

  const rejectShare = useCallback(async (share: RecipeShare, recipientEmail: string): Promise<void> => {
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          shareId: share.id,
          recipientEmail,
        }),
      });
      if (!res.ok) { toast.error('Failed to reject recipe.'); return; }
      setInboxShares((prev) => prev.filter((s) => s.id !== share.id));
    } catch {
      toast.error('Failed to reject recipe.');
    }
  }, []);

  const inboxCount = inboxShares.length;

  return { inboxShares, inboxCount, contacts, fetchInbox, fetchContacts, sendShare, acceptShare, rejectShare };
}
