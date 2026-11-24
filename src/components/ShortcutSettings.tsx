import { useEffect, useState, type ReactNode } from 'react';
import { Check, Compass, Copy, Images, KeyRound, Plus, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useShortcutKey } from '@/hooks/useShortcutKey';
import { useShortcutLink, type ShortcutKind } from '@/hooks/useShortcutLink';
import { SAFARI_SHORTCUT_NAME, SAFARI_SHORTCUT_SCRIPT } from '../../shared/safariShortcut';

/**
 * Settings → iPhone Shortcuts: the personal key, and the two Shortcuts that
 * put Speisekammer in the iPhone's share sheet. A web app cannot appear there
 * by itself (Safari has no Web Share Target support).
 *
 * - "Send to Speisekammer", from the Photos app: pictures of a recipe.
 * - "Save page to Speisekammer", from Safari: the recipe page the person has
 *   open, for sites that refuse their pages to the server (rewe.de and others;
 *   see describePageRefusal in api/extract.ts).
 *
 * Both send the same key, which is shown once, right after it is made; the
 * server keeps only its hash. Once the admin has shared a Shortcut (an iCloud
 * link with an import question for the key), everyone gets an "Add to
 * Shortcuts" button for it and its build steps become a fallback.
 */
export function ShortcutSettings({ open, isAdmin = false }: { open: boolean; isAdmin?: boolean }) {
  const { status, freshKey, busy, error, create, revoke } = useShortcutKey(open);
  const links = useShortcutLink(open);
  const [copied, setCopied] = useState<string | null>(null);
  const endpoint = `${window.location.origin}/api/extract?via=shortcut`;

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : null);

  const address = (kind: ShortcutKind) => (
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 break-all font-mono text-[11px]">{endpoint}</code>
      <Button type="button" variant="outline" className="shrink-0 h-7 rounded-full text-[11px]" onClick={() => void copy(`url-${kind}`, endpoint)}>
        {copied === `url-${kind}` ? 'Copied' : 'Copy address'}
      </Button>
    </div>
  );

  return (
    <section aria-labelledby="shortcut-heading" className="space-y-3">
      <div>
        <Label id="shortcut-heading" className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
          <Smartphone className="w-4 h-4" aria-hidden="true" /> iPhone Shortcuts
        </Label>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
          Two Shortcuts put Speisekammer in your iPhone&apos;s share sheet: one for pictures in the Photos app, one
          for recipe pages in Safari. Recipes are saved right away and marked as new here. Both use the same key.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 space-y-3">
        {status === null && !error && <p className="text-xs text-zinc-500">Checking…</p>}
        {status && !status.hasKey && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">No key yet. The Shortcuts need one to send recipes to your vault.</p>
            <Button type="button" onClick={() => void create()} disabled={busy} className="shrink-0 rounded-full">
              <KeyRound className="w-4 h-4 mr-1" /> Create key
            </Button>
          </div>
        )}
        {status?.hasKey && (
          <div className="space-y-2">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Key made {date(status.created_at)}
              {status.last_used_at ? `, last used ${date(status.last_used_at)}` : ', not used yet'}.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="rounded-full h-8 text-xs"
                onClick={() => { if (window.confirm('Make a new key? The old one stops working at once, so the Shortcuts need the new one.')) void create(); }}
              >
                New key
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="rounded-full h-8 text-xs"
                onClick={() => { if (window.confirm('Remove the key? The Shortcuts will stop working until you make a new one.')) void revoke(); }}
              >
                Remove key
              </Button>
            </div>
          </div>
        )}

        {freshKey && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              Your key: copy it now. It is shown only this once.
            </p>
            <div className="flex items-center gap-2">
              <code data-testid="shortcut-key" className="flex-1 min-w-0 break-all text-xs font-mono text-zinc-800 dark:text-zinc-100">{freshKey}</code>
              <Button type="button" variant="outline" className="shrink-0 h-8 rounded-full text-xs" onClick={() => void copy('key', freshKey)}>
                {copied === 'key' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span className="ml-1">{copied === 'key' ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>
            <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80">
              Anyone with this key can add recipes to your vault (nothing else). If it gets out, make a new one.
            </p>
          </div>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>

      <ShortcutCard
        kind="photos"
        icon={<Images className="w-4 h-4" aria-hidden="true" />}
        heading="From the Photos app"
        name="Send to Speisekammer"
        intro={<>Select one or more pictures, tap Share, then <b>Send to Speisekammer</b>. Several pages become one recipe.</>}
        link={links.urls.photos}
        isAdmin={isAdmin}
        formLabel="Shared Shortcut link"
        saving={links.saving === 'photos'}
        error={links.error?.kind === 'photos' ? links.error.message : null}
        onSave={(value) => void links.save('photos', value)}
      >
        {address('photos')}
        <ol className="list-decimal pl-4 space-y-1.5">
          <li>In the <b>Shortcuts</b> app, tap <b>+</b> and name the shortcut <b>Send to Speisekammer</b>.</li>
          <li>Open its details (ⓘ), turn on <b>Show in Share Sheet</b>, and let it receive <b>Images</b> only.</li>
          <li>
            Add <b>Count</b> (items in Shortcut Input), then <b>If</b> Count is greater than 1:
            <b> Choose from Menu</b> with “One recipe (several pages)” → <b>Text</b> <code>single</code>, and
            “One recipe per picture” → <b>Text</b> <code>each</code>. Otherwise: <b>Text</b> <code>single</code>.
            After the If, add <b>Set Variable</b> <i>Mode</i> to the If Result.
          </li>
          <li>
            Add <b>Repeat with Each</b> item in Shortcut Input, and inside it:
            <b> Resize Image</b> to width 1280 (height automatic),
            <b> Convert Image</b> to JPEG (quality about 70%, keep metadata on),
            <b> Base64 Encode</b> with Line Breaks set to <b>None</b>.
          </li>
          <li>
            After the repeat, add <b>Get Contents of URL</b> with the address above, Method <b>POST</b>,
            a header <code>X-Speisekammer-Key</code> with your key, and Request Body <b>JSON</b> with
            <code> images</code> = Repeat Results and <code>mode</code> = <i>Mode</i>.
          </li>
          <li>Add <b>Get Dictionary Value</b> for <code>message</code>, then <b>Show Notification</b> with it.</li>
        </ol>
        <p className="text-zinc-500 dark:text-zinc-400">
          Up to 8 pictures at a time. The notification says “Got it” as soon as they have arrived; the recipe appears here about a minute later, marked New.
        </p>
      </ShortcutCard>

      <ShortcutCard
        kind="safari"
        icon={<Compass className="w-4 h-4" aria-hidden="true" />}
        heading="From Safari"
        name={SAFARI_SHORTCUT_NAME}
        intro={
          <>
            For recipe sites that block the link import, such as REWE or EDEKA: open the recipe in Safari, tap Share, then
            <b> {SAFARI_SHORTCUT_NAME}</b>. The recipe is saved with its link.
          </>
        }
        note={
          <>
            Once on each iPhone: <b>Settings → Apps → Shortcuts → Advanced</b>, turn on <b>Allow Running Scripts</b>. The
            Shortcut reads the page you have open, so it needs that. If it asks to run on a site, allow it.
          </>
        }
        link={links.urls.safari}
        isAdmin={isAdmin}
        formLabel="Shared Safari Shortcut link"
        saving={links.saving === 'safari'}
        error={links.error?.kind === 'safari' ? links.error.message : null}
        onSave={(value) => void links.save('safari', value)}
      >
        {address('safari')}
        <ol className="list-decimal pl-4 space-y-1.5">
          <li>In the <b>Shortcuts</b> app, tap <b>+</b> and name the shortcut <b>{SAFARI_SHORTCUT_NAME}</b>.</li>
          <li>Open its details (ⓘ), turn on <b>Show in Share Sheet</b>, and let it receive <b>Safari web pages</b> only.</li>
          <li>
            Add <b>Run JavaScript on Web Page</b> (on Shortcut Input) and replace its script with this one:
            <pre data-testid="safari-script" className="mt-1.5 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 font-mono text-[10px] leading-snug whitespace-pre-wrap break-all">{SAFARI_SHORTCUT_SCRIPT}</pre>
            <Button type="button" variant="outline" className="mt-1.5 h-7 rounded-full text-[11px]" onClick={() => void copy('script', SAFARI_SHORTCUT_SCRIPT)}>
              {copied === 'script' ? 'Copied' : 'Copy script'}
            </Button>
          </li>
          <li>
            Add <b>Get Contents of URL</b> with the address above, Method <b>POST</b>, a header
            <code> X-Speisekammer-Key</code> with your key, and Request Body <b>JSON</b> with
            <code> page</code> = JavaScript Result (as Text).
          </li>
          <li>Add <b>Get Dictionary Value</b> for <code>message</code>, then <b>Show Notification</b> with it.</li>
        </ol>
      </ShortcutCard>
    </section>
  );
}

interface CardProps {
  kind: ShortcutKind;
  icon: ReactNode;
  heading: string;
  name: string;
  intro: ReactNode;
  note?: ReactNode;
  link: string | null;
  isAdmin: boolean;
  formLabel: string;
  saving: boolean;
  error: string | null;
  onSave: (value: string) => void;
  /** The build steps, folded away. */
  children: ReactNode;
}

/** One Shortcut: what it does, Add to Shortcuts once shared, the admin's link field, and the build steps. */
function ShortcutCard({ kind, icon, heading, name, intro, note, link, isAdmin, formLabel, saving, error, onSave, children }: CardProps) {
  const [draft, setDraft] = useState('');
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDraft(link ?? ''); }, [link]);
  const headingId = `shortcut-${kind}-heading`;

  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 space-y-2.5">
      <div>
        <h4 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
          {icon} {heading}
        </h4>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">{intro}</p>
      </div>

      {note && <p className="text-xs rounded-lg bg-zinc-50 dark:bg-zinc-800/60 p-2 text-zinc-700 dark:text-zinc-300">{note}</p>}

      {link && (
        <div className="space-y-1.5">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-sk-primary text-white dark:bg-primary dark:text-primary-foreground"
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> Add to Shortcuts
          </a>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Opens the Shortcuts app with <b>{name}</b>. When it asks for the key, paste the one from above.
          </p>
        </div>
      )}

      {isAdmin && (
        <form
          aria-label={formLabel}
          className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-2.5 space-y-2"
          onSubmit={(e) => { e.preventDefault(); onSave(draft); }}
        >
          <Label htmlFor={`shortcut-link-${kind}`} className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {formLabel} (admin)
          </Label>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
            Build the Shortcut once with the steps below. In its settings, open <b>Setup</b> → <b>Add New Question</b> and
            pick the key in the header, so each person is asked for their own (Apple clears your key when you share).
            Then <b>Share</b> → <b>Copy iCloud Link</b> and paste it here: everyone gets the Add to Shortcuts button.
          </p>
          <div className="flex gap-2">
            <input
              id={`shortcut-link-${kind}`}
              type="url"
              inputMode="url"
              placeholder="https://www.icloud.com/shortcuts/…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 min-w-0 h-8 px-3 rounded-full text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
            />
            <Button type="submit" disabled={saving || draft.trim() === (link ?? '')} className="shrink-0 h-8 rounded-full text-xs">
              {draft.trim() ? 'Save link' : 'Remove link'}
            </Button>
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </form>
      )}

      <details className="text-xs text-zinc-700 dark:text-zinc-300">
        <summary className="cursor-pointer font-semibold">
          {link ? 'Build the Shortcut yourself instead' : 'How to set up the Shortcut (once, about 5 minutes)'}
        </summary>
        <div className="mt-3 space-y-3">{children}</div>
      </details>
    </section>
  );
}
