import { useState } from 'react';
import { Link2, UserPlus, Check, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LinkedPerson } from '@/types';

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
              aria-label={`Name for ${person.email}`}
              className="h-8"
            />
            <Button type="submit" size="sm" variant="outline">Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </form>
        ) : (
          <>
            <p className="font-semibold text-sm text-sk-on-surface dark:text-foreground truncate flex items-center gap-1.5">
              {person.label}
              {onRename && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label={`Rename ${person.label}`}
                  title="Set a name"
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
  const [email, setEmail] = useState('');

  return (
    <div className="space-y-5 py-2">
      <div className="space-y-2">
        <Label className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-sk-primary dark:text-primary" /> Connected accounts
        </Label>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Connecting lets you both browse each other’s recipes and save copies. It shares your
          <strong> whole recipe collection</strong>, not selected recipes, until you disconnect.
          Neither of you can edit the other’s recipes.
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
          placeholder="their@email.com"
          aria-label="Email address to connect with"
        />
        <Button type="submit" disabled={busy || !email.trim()} className="gap-1.5 whitespace-nowrap bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground border-0">
          <UserPlus className="w-3.5 h-3.5" /> Invite
        </Button>
      </form>

      {pendingIncoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-sk-on-surface-variant dark:text-muted-foreground">
            Invitations for you
          </p>
          {pendingIncoming.map((p) => (
            <PersonRow
              key={p.linkId}
              person={p}
              action={
                <>
                  <Button size="sm" disabled={busy} onClick={() => onAccept(p.linkId)} className="gap-1 bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground border-0">
                    <Check className="w-3 h-3" /> Accept
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onDisconnect(p.linkId)} aria-label={`Decline invitation from ${p.label}`}>
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
            Connected
          </p>
          {connected.map((p) => (
            <PersonRow
              key={p.linkId}
              person={p}
              onRename={(label) => onRename(p.linkId, label)}
              action={
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onDisconnect(p.linkId)}>
                  Disconnect
                </Button>
              }
            />
          ))}
        </div>
      )}

      {pendingOutgoing.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-sk-on-surface-variant dark:text-muted-foreground">
            Waiting for them to accept
          </p>
          {pendingOutgoing.map((p) => (
            <PersonRow
              key={p.linkId}
              person={p}
              action={
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onDisconnect(p.linkId)}>
                  Cancel
                </Button>
              }
            />
          ))}
        </div>
      )}

      {connected.length === 0 && pendingIncoming.length === 0 && pendingOutgoing.length === 0 && (
        <p className="text-sm text-sk-outline dark:text-muted-foreground">
          No connections yet. Invite someone you cook with.
        </p>
      )}
    </div>
  );
}
