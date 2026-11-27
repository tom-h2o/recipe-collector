import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { msg, t, translateMessage } from '@/i18n';
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
    if (error) toast.error(t('Could not load your connections.'));
    setLinks(((data as AccountLink[]) ?? []).map((l) => toLinkedPerson(l, userId, userEmail)));
    setLoading(false);
  }, [userId, userEmail]);

  const invite = useCallback(
    async (email: string) => {
      if (!userId || !userEmail) return;
      const target = email.trim().toLowerCase();
      if (!target) return;
      if (target === userEmail.toLowerCase()) {
        toast.error(t('You cannot connect to yourself.'));
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
            error.code === '23505' ? msg('You have already invited that person.') : error.message,
          );
        }
        toast.success(t('Invitation sent to {email}', { email: target }));
        await fetchLinks();
      } catch (err) {
        toast.error(translateMessage(err instanceof Error ? err.message : msg('Could not send the invitation.')));
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
        // Through the database function, not an update: since migration 0074
        // the browser may not write status or addressee_id at all, because
        // writing them directly is how a link could be forged. The function
        // checks the invitation was sent to this account's confirmed address.
        const { error } = await supabase.rpc('accept_account_link', { link_id: linkId });
        if (error) throw new Error(error.message);
        toast.success(t('Connected — you can now see each other’s recipes.'));
        await fetchLinks();
      } catch (err) {
        toast.error(translateMessage(err instanceof Error ? err.message : msg('Could not accept the invitation.')));
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
        // A delete the policy refuses matches nothing and reports no error, so
        // ask for the row back: declining used to say "Disconnected" while the
        // invitation stayed where it was.
        const { data, error } = await supabase.from('account_links').delete().eq('id', linkId).select('id');
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error(msg('Could not disconnect. Please reload and try again.'));
        setLinks((prev) => prev.filter((l) => l.linkId !== linkId));
        toast.success(t('Disconnected'));
      } catch (err) {
        toast.error(translateMessage(err instanceof Error ? err.message : msg('Could not disconnect.')));
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
      if (error) { toast.error(t('Could not save the name.')); return; }
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
