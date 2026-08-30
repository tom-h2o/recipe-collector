import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { AccountLink, LinkedPerson } from '@/types';

/**
 * Resolves a link row into "the other person", from the perspective of the
 * viewer. The row is symmetric; which columns describe you depends on whether
 * you sent the invitation or received it.
 */
export function toLinkedPerson(link: AccountLink, viewerId: string, viewerEmail: string): LinkedPerson {
  const iAmRequester = link.requester_id === viewerId;
  const email = iAmRequester ? link.addressee_email : link.requester_email;
  // Each side stores its own name for the other; fall back to the address.
  const label = (iAmRequester ? link.requester_label : link.addressee_label) || email;

  return {
    linkId: link.id,
    userId: iAmRequester ? link.addressee_id : link.requester_id,
    email,
    label,
    status: link.status,
    incoming: !iAmRequester && link.addressee_email.toLowerCase() === viewerEmail.toLowerCase(),
    myLabelColumn: iAmRequester ? 'requester_label' : 'addressee_label',
  };
}

export function useAccountLinks(userId?: string | null, userEmail?: string | null) {
  const [links, setLinks] = useState<LinkedPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchLinks = useCallback(async () => {
    if (!userId || !userEmail) { setLinks([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('account_links')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) toast.error('Could not load your connections.');
    setLinks(((data as AccountLink[]) ?? []).map((l) => toLinkedPerson(l, userId, userEmail)));
    setLoading(false);
  }, [userId, userEmail]);

  const invite = useCallback(
    async (email: string) => {
      if (!userId || !userEmail) return;
      const target = email.trim().toLowerCase();
      if (!target) return;
      if (target === userEmail.toLowerCase()) {
        toast.error('You cannot connect to yourself.');
        return;
      }
      setBusy(true);
      try {
        const { error } = await supabase.from('account_links').insert({
          requester_id: userId,
          requester_email: userEmail,
          addressee_email: target,
        });
        if (error) {
          // the unique constraint is the common case, and worth naming
          throw new Error(
            error.code === '23505' ? 'You have already invited that person.' : error.message,
          );
        }
        toast.success(`Invitation sent to ${target}`);
        await fetchLinks();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not send the invitation.');
      } finally {
        setBusy(false);
      }
    },
    [userId, userEmail, fetchLinks],
  );

  const accept = useCallback(
    async (linkId: string) => {
      if (!userId) return;
      setBusy(true);
      try {
        const { error } = await supabase
          .from('account_links')
          .update({ status: 'accepted', addressee_id: userId, accepted_at: new Date().toISOString() })
          .eq('id', linkId);
        if (error) throw new Error(error.message);
        toast.success('Connected — you can now see each other’s recipes.');
        await fetchLinks();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not accept the invitation.');
      } finally {
        setBusy(false);
      }
    },
    [userId, fetchLinks],
  );

  /** Used for both declining an invitation and disconnecting an active link. */
  const disconnect = useCallback(
    async (linkId: string) => {
      setBusy(true);
      try {
        const { error } = await supabase.from('account_links').delete().eq('id', linkId);
        if (error) throw new Error(error.message);
        setLinks((prev) => prev.filter((l) => l.linkId !== linkId));
        toast.success('Disconnected');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not disconnect.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const rename = useCallback(
    async (linkId: string, label: string) => {
      if (!userId) return;
      const link = links.find((l) => l.linkId === linkId);
      if (!link) return;
      // Each side owns one label column; which one was resolved when the row
      // was mapped, so no second lookup is needed.
      const { error } = await supabase
        .from('account_links')
        .update({ [link.myLabelColumn]: label.trim() || null })
        .eq('id', linkId);
      if (error) { toast.error('Could not save the name.'); return; }
      setLinks((prev) =>
        prev.map((l) => (l.linkId === linkId ? { ...l, label: label.trim() || l.email } : l)),
      );
    },
    [userId, links],
  );

  const connected = links.filter((l) => l.status === 'accepted');
  const pendingIncoming = links.filter((l) => l.status === 'pending' && l.incoming);
  const pendingOutgoing = links.filter((l) => l.status === 'pending' && !l.incoming);

  return { links, connected, pendingIncoming, pendingOutgoing, loading, busy, fetchLinks, invite, accept, disconnect, rename };
}
