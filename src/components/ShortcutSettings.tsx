import { useEffect, useState, type ReactNode } from 'react';
import { Check, Compass, Copy, Images, KeyRound, Link2, Plus, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useShortcutKey } from '@/hooks/useShortcutKey';
import { useShortcutLink, type ShortcutKind } from '@/hooks/useShortcutLink';
import { findShortcutLink } from '../../shared/shortcutLink';
import { SAFARI_SHORTCUT_NAME, SAFARI_SHORTCUT_SCRIPT } from '../../shared/safariShortcut';
import { LINK_SHORTCUT_NAME } from '../../shared/linkShortcut';

/**
 * Settings → iPhone Shortcuts: the personal key, and the three Shortcuts
 * that put Speisekammer in the iPhone's share sheet. A web app cannot appear
 * there by itself (Safari has no Web Share Target support).
 *
 * - "Send to Speisekammer", from the Photos app: pictures of a recipe.
 * - "Save page to Speisekammer", from Safari: the recipe page the person has
 *   open, for sites that refuse their pages to the server (rewe.de and others;
 *   see describePageRefusal in api/_lib/sharedPage.ts).
 * - "Send link to Speisekammer", from Instagram or any other app: a link,
 *   which the server fetches; a post's recipe is read from its caption.
 *
 * All three send the same key, which is shown once, right after it is made; the
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
          Three Shortcuts put Speisekammer in your iPhone&apos;s share sheet: for pictures in the Photos app, for
          recipe pages in Safari, and for links from Instagram or any other app. Recipes are saved right away and
          marked as new here. All three use the same key.
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

      <ShortcutCard
        kind="link"
        icon={<Link2 className="w-4 h-4" aria-hidden="true" />}
        heading="From Instagram and other apps"
        name={LINK_SHORTCUT_NAME}
        intro={
          <>
            On an Instagram post or reel, tap the paper plane, then <b>Share</b> and <b>{LINK_SHORTCUT_NAME}</b>. The
            recipe is read from the post&apos;s caption; one that is only spoken or shown in the video cannot be read.
            A link from any other app works too.
          </>
        }
        note={
          <>
            Private posts, and the odd post Instagram will not show without a login, come back with a notification
            saying so: open those in Safari and use <b>{SAFARI_SHORTCUT_NAME}</b> instead.
          </>
        }
        link={links.urls.link}
        isAdmin={isAdmin}
        formLabel="Shared link Shortcut link"
        saving={links.saving === 'link'}
        error={links.error?.kind === 'link' ? links.error.message : null}
        onSave={(value) => void links.save('link', value)}
      >
        {address('link')}
        <ol className="list-decimal pl-4 space-y-1.5">
          <li>In the <b>Shortcuts</b> app, tap <b>+</b> and name the shortcut <b>{LINK_SHORTCUT_NAME}</b>.</li>
          <li>Open its details (ⓘ), turn on <b>Show in Share Sheet</b>, and let it receive <b>URLs</b> and <b>Text</b>.</li>
          <li>
            Add <b>Get Contents of URL</b> with the address above, Method <b>POST</b>, a header
            <code> X-Speisekammer-Key</code> with your key, and Request Body <b>JSON</b> with
            <code> url</code> = Shortcut Input.
          </li>
          <li>Add <b>Get Dictionary Value</b> for <code>message</code>, then <b>Show Notification</b> with it.</li>
        </ol>
        <p className="text-zinc-500 dark:text-zinc-400">
          The first time, the Shortcut may be under <b>More</b> at the end of the share sheet&apos;s app row, or in
          its list of actions; <b>Edit Actions</b> there puts it among the favourites.
        </p>
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
  const [notFound, setNotFound] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDraft(link ?? ''); }, [link]);

  /**
   * A paste is saved as soon as it holds an iCloud link: the field is not one
   * people expect to confirm, and Settings' own Save button below does not
   * save it, which is how a link pasted on an iPhone was lost. Whatever came
   * with the link (the Shortcut's name, a query) is dropped.
   */
  const changeDraft = (value: string) => {
    setDraft(value);
    setNotFound(false);
    const found = findShortcutLink(value);
    if (found && found !== link) onSave(found);
  };
  const submit = () => {
    if (!draft.trim()) { onSave(''); return; }
    const found = findShortcutLink(draft);
    if (found) onSave(found); else setNotFound(true);
  };
  const saved = !!link && findShortcutLink(draft) === link;
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
          onSubmit={(e) => { e.preventDefault(); submit(); }}
        >
          <Label htmlFor={`shortcut-link-${kind}`} className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {formLabel} (admin)
          </Label>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
            Build the Shortcut once with the steps below, with your key in a <b>Text</b> action at the top and that
            Text used in the header. Then <b>ⓘ</b> → <b>Setup</b> → <b>Add New Question</b> and pick that Text action,
            so each person is asked for their own key (Apple clears yours when you share). Then <b>Share</b> →
            <b> Copy iCloud Link</b> and paste it here. It is saved at once, and everyone gets the Add to Shortcuts button.
          </p>
          <div className="flex gap-2">
            {/* Plain text, not type="url": a paste with the Shortcut's name in
                front is not a URL, and Safari then refused to submit the form
                without saying why. */}
            <input
              id={`shortcut-link-${kind}`}
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://www.icloud.com/shortcuts/…"
              value={draft}
              onChange={(e) => changeDraft(e.target.value)}
              className="flex-1 min-w-0 h-9 px-3 rounded-full text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
            />
            {saved ? (
              <Button type="button" variant="outline" disabled={saving} onClick={() => { setDraft(''); onSave(''); }} className="shrink-0 h-9 rounded-full text-xs">
                Remove link
              </Button>
            ) : (
              <Button type="submit" disabled={saving || (!draft.trim() && !link)} className="shrink-0 h-9 rounded-full text-xs">
                {draft.trim() ? 'Save link' : 'Remove link'}
              </Button>
            )}
          </div>
          {saving && <p className="text-xs text-zinc-500" role="status">Saving…</p>}
          {!saving && saved && !error && (
            <p className="text-xs text-sk-primary dark:text-primary flex items-center gap-1" role="status">
              <Check className="w-3.5 h-3.5" aria-hidden="true" /> Saved. Everyone sees Add to Shortcuts for this one.
            </p>
          )}
          {notFound && (
            <p role="alert" className="text-xs text-destructive">
              No iCloud link found in that. In Shortcuts: open the Shortcut, <b>Share</b> → <b>Copy iCloud Link</b>, then paste here.
            </p>
          )}
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
