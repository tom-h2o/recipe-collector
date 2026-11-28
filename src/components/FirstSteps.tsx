import type { ReactNode } from 'react';
import { CalendarDays, Check, ChefHat, Plus, Share, Smartphone } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { isInstalledApp } from '@/lib/firstSteps';
import { useT } from '@/i18n';
import { rich } from '@/i18n/rich';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Opens the add-recipe form. */
  onAddRecipe: () => void;
  /** Opens Settings, where the iPhone Shortcuts are. */
  onOpenSettings: () => void;
}

/**
 * "First steps": what a newly invited person needs to be told once, in the
 * order they need it. Put the app on the Home Screen, add a first recipe, set
 * up the two iPhone Shortcuts, and where cooking, planning and shopping are.
 *
 * It is a page of the app rather than a PDF or a video because it is read on
 * the phone the steps are done on: its buttons open the add form and the
 * Shortcut settings directly, and it cannot go out of date behind the app.
 * Opens by itself once for someone whose vault is empty (App decides), and
 * stays under the account list.
 */
export function FirstSteps({ isOpen, onClose, onAddRecipe, onOpenSettings }: Props) {
  const t = useT();
  const installed = isInstalledApp();
  const b = (text: ReactNode) => <strong className="font-semibold text-sk-on-surface dark:text-foreground">{text}</strong>;
  const then = (action: () => void) => () => { onClose(); action(); };

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      title={t('First steps')}
      description={t('Four things, about five minutes. You can open this again any time from your account.')}
      className="sm:max-w-lg"
    >
      <ol className="space-y-5">
        <Step n={1} icon={<Smartphone className="w-4 h-4" aria-hidden="true" />} title={t('Put the app on your Home Screen')}>
          {installed ? (
            <p className="flex items-center gap-1.5 text-sk-primary dark:text-primary font-medium">
              <Check className="w-4 h-4 shrink-0" aria-hidden="true" /> {t('Done: you opened it from there.')}
            </p>
          ) : (
            <>
              <p>
                {rich(t, 'On an iPhone, open this page in <b>Safari</b>, tap <b>Share</b> <share/> and choose <b>Add to Home Screen</b>. Then open Speisekammer from there and sign in once more.', {
                  b,
                  share: () => <Share className="inline w-3.5 h-3.5 -mt-0.5" aria-hidden="true" />,
                })}
              </p>
              <p className="mt-1.5">{t('It then opens like any other app, full screen, and the screen stays on while you cook. On Android or a computer, the browser’s menu has “Install” or “Add to Home screen”.')}</p>
            </>
          )}
        </Step>

        <Step n={2} icon={<Plus className="w-4 h-4" aria-hidden="true" />} title={t('Add your first recipe')}>
          <p>{t('Paste a link, take photos of a cookbook page, choose a PDF or paste text. The app reads the recipe; you check it and save. Tags and nutrition follow by themselves.')}</p>
          <Button type="button" onClick={then(onAddRecipe)} className="mt-2.5 h-9 rounded-full px-4 bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground border-0">
            {t('Add a recipe')}
          </Button>
        </Step>

        <Step n={3} icon={<Share className="w-4 h-4" aria-hidden="true" />} title={t('Send recipes straight from your iPhone')}>
          <p>
            {rich(t, 'Two Shortcuts put Speisekammer into the iPhone’s <b>Share</b> menu: one for pictures in Photos, one for pages in Safari and links from Instagram and other apps.', { b })}
          </p>
          <ol className="mt-1.5 list-decimal pl-5 space-y-1">
            <li>{rich(t, 'In Settings → General → <b>iPhone Shortcuts</b>, make your key and copy it.', { b })}</li>
            <li>{rich(t, 'Tap <b>Add to Shortcuts</b> for each of the two, and paste the key when it asks.', { b })}</li>
            <li>{rich(t, 'Once, in the iPhone’s own Settings → Apps → Shortcuts → Advanced: switch on <b>Allow Running Scripts</b>. The Safari Shortcut needs it.', { b })}</li>
          </ol>
          <Button type="button" variant="outline" onClick={then(onOpenSettings)} className="mt-2.5 h-9 rounded-full px-4">
            {t('Open the Shortcut settings')}
          </Button>
        </Step>

        <Step n={4} icon={<ChefHat className="w-4 h-4" aria-hidden="true" />} title={t('Cook, plan and shop')}>
          <p>
            {rich(t, 'Open a recipe and tap <b>Cook</b> for one step at a time, with timers. Put recipes on days under <b>Plan</b> <plan/>, and <b>Shopping</b> makes one list from the meals you tick.', {
              b,
              plan: () => <CalendarDays className="inline w-3.5 h-3.5 -mt-0.5" aria-hidden="true" />,
            })}
          </p>
          <p className="mt-1.5">{t('Something not working, or an idea? Your account → Send feedback reaches the person who runs the app.')}</p>
        </Step>
      </ol>

      <div className="mt-6 flex justify-end">
        <Button type="button" variant="outline" onClick={onClose} className="h-9 rounded-full px-5">{t('Got it##first steps')}</Button>
      </div>
    </Sheet>
  );
}

function Step({ n, icon, title, children }: { n: number; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-sk-primary-fixed/60 dark:bg-primary/15 text-sk-primary dark:text-primary flex items-center justify-center" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-serif text-lg leading-snug text-sk-on-surface dark:text-foreground">
          <span className="sr-only">{n}. </span>{title}
        </h3>
        <div className="mt-1 text-sm font-sans leading-relaxed text-sk-on-surface-variant dark:text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}
