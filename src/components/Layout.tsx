import { useRef } from 'react';
import { Plus, Wand2, Inbox, CalendarDays, ShoppingCart, BookOpen } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { ActiveView } from '@/types';
import { UserMenu } from '@/components/UserMenu';
import { useDarkMode } from '@/hooks/useDarkMode';
import { usePillPosition } from '@/hooks/usePillPosition';
import { msg, useT } from '@/i18n';

interface Props {
  activeView: ActiveView;
  user: User | null;
  isAdmin: boolean;
  onOpenWhatsNew?: () => void;
  hasUnreadReleases?: boolean;
  inboxCount: number;
  onSetView: (v: ActiveView) => void;
  onOpenSettings: () => void;
  onOpenSuggest: () => void;
  onAddRecipe: () => void;
  onSignOut: () => void;
  children: React.ReactNode;
}

const MOBILE_TABS = [
  { view: 'vault' as const, icon: BookOpen, label: msg('Vault') },
  { view: 'planner' as const, icon: CalendarDays, label: msg('Planner') },
  { view: 'shopping' as const, icon: ShoppingCart, label: msg('Shopping') },
  { view: 'inbox' as const, icon: Inbox, label: msg('Inbox') },
] as const;

export function Layout({ activeView, user, isAdmin, onOpenWhatsNew, hasUnreadReleases, inboxCount, onSetView, onOpenSettings, onOpenSuggest, onAddRecipe, onSignOut, children }: Props) {
  const t = useT();
  const { isDark, toggle } = useDarkMode();
  // One pill per tab bar; each slides to whichever tab is current.
  const desktopTabs = useRef<HTMLDivElement>(null);
  const mobileTabs = useRef<HTMLDivElement>(null);
  const desktopPill = usePillPosition(desktopTabs, activeView);
  const mobilePill = usePillPosition(mobileTabs, activeView);
  // Both placements of the account (top right from lg, last tab below) offer
  // the same entries.
  const account = user ? {
    user,
    onSignOut,
    onOpenSettings,
    onOpenWhatsNew,
    hasUnreadReleases,
    currentView: activeView,
    isAdmin,
    onOpenAdmin: () => onSetView('admin'),
    isDark,
    onToggleTheme: toggle,
  } : null;

  return (
    <>
      {/* Sticky header — full-width, independent of content padding */}
      <header className="sticky top-0 z-40 w-full glass-bar pt-[var(--safe-top)] pl-[var(--safe-left)] pr-[var(--safe-right)] print:static print:border-0 print:p-0">
        {/* Two columns below lg, three from lg (with three throughout, the
            hidden desktop tabs left the buttons in the middle column and an
            empty one after it). On a phone the row holds the name and two
            buttons, Suggest and Add: light/dark, Settings and the account
            moved into the account list, which the bottom bar's last tab
            opens. The name is still cut short rather than the page scrolling
            sideways (tests/e2e/headerFit.spec.ts). */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-10 h-16 sm:h-[4.5rem] grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-4">

          {/* Branding. Free to shrink below lg only: from lg the desktop tabs
              take their full width as well, and the name gave way to them. */}
          <div className="flex min-w-0 lg:min-w-max items-center gap-2 sm:gap-3">
            <svg className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="#315f3b" strokeWidth="2.5" fill="none"/>
              <circle cx="11" cy="11" r="3" fill="#315f3b"/>
              <line x1="16.5" y1="14.5" x2="30" y2="28" stroke="#315f3b" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="23" y1="21.5" x2="26" y2="24.5" stroke="#315f3b" strokeWidth="2" strokeLinecap="round"/>
              <line x1="26" y1="24.5" x2="29" y2="21.5" stroke="#315f3b" strokeWidth="2" strokeLinecap="round"/>
              <path d="M7 4 Q11 1 15 5 Q11 8 7 4Z" fill="#bcefc0" opacity="0.8"/>
            </svg>
            <div className="flex min-w-0 flex-col leading-none">
              <h1 className="truncate font-serif text-base min-[375px]:text-lg sm:text-xl font-normal tracking-tight text-sk-primary dark:text-primary">
                Speisekammer
              </h1>
              <span className="hidden sm:block text-[10px] font-sans font-medium uppercase tracking-[0.15em] text-sk-on-surface-variant dark:text-muted-foreground">
                {t('Recipe Vault')}
              </span>
            </div>
          </div>

          {/* Desktop nav tabs: a glass capsule, with a tinted pill that slides
              to the current tab instead of each tab painting its own.
              The row stops growing at 1152 px (max-w-6xl: 1072 px inside the
              margins), so the longer labels and wider padding from xl come out
              of the same room as below it. With xl:px-5 tabs and a labelled
              Suggest, the admin's buttons ran 63 px past the right margin,
              102 px with a three-digit Vault and a two-digit Inbox
              (tests/e2e/headerFit.spec.ts). */}
          <div className="hidden lg:flex justify-center">
            <div ref={desktopTabs} className="relative flex glass rounded-full p-1 gap-0.5">
              <span aria-hidden="true" className="tab-pill" data-ready={desktopPill.ready} style={desktopPill.style} />
              {(['vault', 'planner', 'shopping', 'inbox'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => onSetView(view)}
                  aria-current={activeView === view ? 'page' : undefined}
                  className={`relative z-10 px-2.5 xl:px-3.5 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors duration-200 flex items-center gap-1.5 ${
                    activeView === view
                      ? 'text-sk-primary dark:text-primary'
                      : 'text-sk-on-surface-variant dark:text-muted-foreground hover:text-sk-primary dark:hover:text-primary'
                  }`}
                >
                  {view === 'vault' ? t('Vault')
                    : view === 'planner'
                      // Labels stay on one line, so the long one is shortened
                      // where the header is narrow rather than left to wrap.
                      ? <><span className="xl:hidden">{t('Planner')}</span><span className="hidden xl:inline">{t('Meal Planner')}</span></>
                    : view === 'shopping' ? t('Shopping')
                    : t('Inbox')}
                  {view === 'inbox' && inboxCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sk-primary text-white dark:text-primary-foreground">
                      {inboxCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Actions: what is about recipes. Suggest is the quiet one, Add
              the one filled button. Both are labelled where there is room:
              between sm and lg (no tabs there), and Add again from xl. */}
          <div className="flex items-center gap-2 sm:gap-3 justify-end">
            <button
              onClick={onOpenSuggest}
              className="inline-flex shrink-0 items-center justify-center gap-2 bg-sk-primary-fixed/60 hover:bg-sk-primary-fixed dark:bg-primary/15 dark:hover:bg-primary/25 text-sk-primary dark:text-primary font-semibold rounded-full transition-colors h-10 text-sm w-10 sm:w-auto sm:px-5 lg:w-10 lg:px-0"
              title={t('Suggest a recipe')}
              aria-label={t('Suggest a recipe')}
            >
              <Wand2 className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline lg:hidden">{t('Suggest')}</span>
            </button>
            <button
              onClick={onAddRecipe}
              aria-label={t('Add recipe')}
              title={t('Add recipe')}
              className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/80 text-white dark:text-primary-foreground font-semibold rounded-full shadow-ambient transition-all duration-200 hover:scale-[1.02] h-10 text-sm w-10 sm:w-auto sm:px-6"
            >
              <Plus className="w-4 h-4 shrink-0" />
              {/* "Add" alone between 1024 and 1280 px, where the desktop tabs
                  leave no room for "Add Recipe". */}
              <span className="hidden sm:inline lg:hidden xl:inline">{t('Add Recipe')}</span>
              <span className="hidden lg:inline xl:hidden">{t('Add')}</span>
            </button>
            {/* From lg only (the component hides itself below): on a phone
                the account is the bottom bar's last tab. */}
            {account && <UserMenu variant="header" {...account} />}
          </div>
        </div>
      </header>

      {/* Content. The outer padding keeps it clear of the notch when a phone
          is turned sideways; the inner one is the page margin. */}
      <div className="pl-[var(--safe-left)] pr-[var(--safe-right)] print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-10 pt-6 sm:pt-8 pb-32 lg:pb-12 space-y-6">
          {children}

          <footer className="pt-4 pb-2 flex justify-center">
            <span className="flex items-center gap-1.5 text-xs font-sans text-sk-outline dark:text-muted-foreground">
              <svg className="w-3.5 h-3.5 text-sk-primary" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                <circle cx="5" cy="5" r="1.2" fill="currentColor"/>
                <line x1="7.5" y1="6.5" x2="13" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Speisekammer
            </span>
          </footer>
        </div>
      </div>

      {/* Content runs out softly under the floating tab bar instead of being
          cut off by it. Purely visual, so it takes no taps. */}
      <div aria-hidden="true" className="tab-bar-fade fixed inset-x-0 bottom-0 z-40 pointer-events-none lg:hidden print:hidden" />

      {/* Mobile navigation: a glass capsule floating over the content */}
      <nav className="tab-bar-floating fixed inset-x-3 z-50 lg:hidden print:hidden">
        <div ref={mobileTabs} className="relative flex items-stretch h-[3.75rem] max-w-md mx-auto glass rounded-full px-1">
          <span aria-hidden="true" className="tab-pill" data-ready={mobilePill.ready} style={mobilePill.style} />
          {MOBILE_TABS.map(({ view, icon: Icon, label }) => {
            const isActive = activeView === view;
            return (
              <button
                key={view}
                onClick={() => onSetView(view)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative z-10 flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 rounded-full transition-colors ${
                  isActive
                    ? 'text-sk-primary dark:text-primary'
                    : 'text-sk-on-surface-variant dark:text-muted-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold font-sans">{t(label)}</span>
                {view === 'inbox' && inboxCount > 0 && (
                  <span className="absolute top-1.5 left-1/2 ml-1.5 w-4 h-4 bg-sk-primary text-white dark:text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
                    {inboxCount}
                  </span>
                )}
              </button>
            );
          })}
          {account && <UserMenu variant="tab" {...account} />}
        </div>
      </nav>
    </>
  );
}
