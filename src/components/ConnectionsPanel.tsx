import { useState } from 'react';
import { Link2, UserPlus, Check, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LinkedPerson } from '@/types';
import { useT } from '@/i18n';
import { rich } from '@/i18n/rich';

interface Props {
  connected: LinkedPerson[];
  pendingIncoming: LinkedPerson[];
  pendingOutgoing: LinkedPerson[];
  busy?: boolean;
  onInvite: (email: string) => void;
  onAccept: (linkId: string) => void;
  onDisconnect: (linkId: string) => void;
  onRename: (linkId: string, label: string) => void;
}

function PersonRow({
  person, action, onRename,
}: { person: LinkedPerson; action: React.ReactNode; onRename?: (label: string) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(person.label === person.email ? '' : person.label);

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-sk-surface-low dark:bg-muted">
      <div className="min-w-0 flex-1">
        {editing && onRename ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); onRename(draft); setEditing(false); }}
          >
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={person.email}
              aria-label={t('Name for {email}', { email: person.email })}
              className="h-8"
            />
            <Button type="submit" size="sm" variant="outline">{t('Save')}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>{t('Cancel')}</Button>
          </form>
        ) : (
          <>
            <p className="font-semibold text-sm text-sk-on-surface dark:text-foreground truncate flex items-center gap-1.5">
              {person.label}
              {onRename && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label={t('Rename {name}', { name: person.label })}
                  title={t('Set a name')}
                  className="text-sk-outline hover:text-sk-primary dark:hover:text-primary transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </p>
            {/* the address is still worth showing when a nickname replaces it */}
            {person.label !== person.email && (
              <p className="text-xs text-sk-on-surface-variant dark:text-muted-foreground truncate">{person.email}</p>
            )}
          </>
        )}
      </div>
      {!editing && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}

/**
 * Linked accounts. A connection makes both vaults readable to each other, which
 * is a bigger step than sending a single recipe, so the invite says so plainly.
 */
export function ConnectionsPanel({
  connected, pendingIncoming, pendingOutgoing, busy, onInvite, onAccept, onDisconnect, onRename,
}: Props) {
  const t = useT();
  const [email, setEmail] = useState('');

  return (
    <div className="space-y-5 py-2">
      <div className="space-y-2">
        <Label className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-sk-primary dark:text-primary" /> {t('Connected accounts')}
        </Label>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {rich(t, 'Connecting lets you both browse each other’s recipes and save copies. It shares your <b>whole recipe collection</b>, not selected recipes, until you disconnect. Neither of you can edit the other’s recipes.', { b: (text) => <strong>{text}</strong> })}
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); onInvite(email); setEmail(''); }}
      >
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('their@email.com')}
          aria-label={t('Email address to connect with')}
        />
        <Button type="submit" disabled={busy || !email.trim()} className="gap-1.5 whitespace-nowrap bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground border-0">
          <UserPlus className="w-3.5 h-3.5" /> {t('Invite')}
        </Button>
      </form>

      {pendingIncoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-sk-on-surface-variant dark:text-muted-foreground">
            {t('Invitations for you')}
          </p>
          {pendingIncoming.map((p) => (
            <PersonRow
              key={p.linkId}
              person={p}
              action={
                <>
                  <Button size="sm" disabled={busy} onClick={() => onAccept(p.linkId)} className="gap-1 bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground border-0">
                    <Check className="w-3 h-3" /> {t('Accept')}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onDisconnect(p.linkId)} aria-label={t('Decline invitation from {name}', { name: p.label })}>
                    <X className="w-3 h-3" />
                  </Button>
                </>
              }
            />
          ))}
        </div>
      )}

      {connected.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-sk-on-surface-variant dark:text-muted-foreground">
            {t('Connected')}
          </p>
          {connected.map((p) => (
            <PersonRow
              key={p.linkId}
              person={p}
              onRename={(label) => onRename(p.linkId, label)}
              action={
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onDisconnect(p.linkId)}>
                  {t('Disconnect')}
                </Button>
              }
            />
          ))}
        </div>
      )}

      {pendingOutgoing.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-sk-on-surface-variant dark:text-muted-foreground">
            {t('Waiting for them to accept')}
          </p>
          {pendingOutgoing.map((p) => (
            <PersonRow
              key={p.linkId}
              person={p}
              action={
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onDisconnect(p.linkId)}>
                  {t('Cancel')}
                </Button>
              }
            />
          ))}
        </div>
      )}

      {connected.length === 0 && pendingIncoming.length === 0 && pendingOutgoing.length === 0 && (
        <p className="text-sm text-sk-outline dark:text-muted-foreground">
          {t('No connections yet. Invite someone you cook with.')}
        </p>
      )}
    </div>
  );
}
