import { Plus, Settings, Wand2, Sun, Moon, Inbox, CalendarDays, ShoppingCart, BookOpen } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { ActiveView } from '@/types';
import { UserMenu } from '@/components/UserMenu';
import { useDarkMode } from '@/hooks/useDarkMode';

interface Props {
  activeView: ActiveView;
  user: User | null;
  recipeCount: number;
  inboxCount: number;
  onSetView: (v: ActiveView) => void;
  onOpenSettings: () => void;
  onOpenSuggest: () => void;
  onAddRecipe: () => void;
  onSignOut: () => void;
  children: React.ReactNode;
}

const MOBILE_TABS = [
  { view: 'vault' as const, icon: BookOpen, label: 'Vault' },
  { view: 'planner' as const, icon: CalendarDays, label: 'Planner' },
  { view: 'shopping' as const, icon: ShoppingCart, label: 'Shopping' },
  { view: 'inbox' as const, icon: Inbox, label: 'Inbox' },
] as const;

export function Layout({ activeView, user, recipeCount, inboxCount, onSetView, onOpenSettings, onOpenSuggest, onAddRecipe, onSignOut, children }: Props) {
  const { isDark, toggle } = useDarkMode();

  return (
    <div className="max-w-6xl mx-auto space-y-8 print:hidden pb-20 lg:pb-0">
      {/* Header — tonal transition, no hard border */}
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-4 pb-5 sm:pb-6 bg-background">
        {/* Branding — Speisekammer wordmark */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Skeleton key icon in emerald green */}
          <svg
            className="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 shrink-0"
            viewBox="0 0 36 36"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" stroke="#315f3b" strokeWidth="2.5" fill="none"/>
            <circle cx="11" cy="11" r="3" fill="#315f3b"/>
            {/* Key stem */}
            <line x1="16.5" y1="14.5" x2="30" y2="28" stroke="#315f3b" strokeWidth="2.5" strokeLinecap="round"/>
            {/* Key teeth */}
            <line x1="23" y1="21.5" x2="26" y2="24.5" stroke="#315f3b" strokeWidth="2" strokeLinecap="round"/>
            <line x1="26" y1="24.5" x2="29" y2="21.5" stroke="#315f3b" strokeWidth="2" strokeLinecap="round"/>
            {/* Basil leaf hint on bow */}
            <path d="M7 4 Q11 1 15 5 Q11 8 7 4Z" fill="#bcefc0" opacity="0.8"/>
          </svg>
          <div className="flex flex-col leading-none">
            <h1 className="font-serif text-lg sm:text-xl md:text-2xl font-normal tracking-tight text-sk-primary dark:text-primary">
              Speisekammer
            </h1>
            <span className="hidden sm:block text-[10px] font-sans font-medium uppercase tracking-[0.15em] text-sk-on-surface-variant dark:text-muted-foreground">
              Recipe Vault
            </span>
          </div>
        </div>

        {/* Desktop nav tabs — pill pill pill */}
        <div className="hidden lg:flex justify-center">
          <div className="flex bg-sk-surface-low dark:bg-muted rounded-full p-1 gap-0.5">
            {(['vault', 'planner', 'shopping', 'inbox'] as const).map((view) => (
              <button
                key={view}
                onClick={() => onSetView(view)}
                className={`px-5 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                  activeView === view
                    ? 'bg-white dark:bg-card shadow-ambient text-sk-primary dark:text-primary font-semibold'
                    : 'text-sk-on-surface-variant dark:text-muted-foreground hover:text-sk-primary dark:hover:text-primary hover:bg-white/60 dark:hover:bg-card/40'
                }`}
              >
                {view === 'vault' ? 'Vault'
                  : view === 'planner' ? 'Meal Planner'
                  : view === 'shopping' ? 'Shopping'
                  : 'Inbox'}
                {view === 'vault' && recipeCount > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeView === 'vault'
                      ? 'bg-sk-primary-fixed text-sk-on-primary-fixed'
                      : 'bg-sk-surface-high dark:bg-muted text-sk-on-surface-variant'
                  }`}>
                    {recipeCount}
                  </span>
                )}
                {view === 'inbox' && inboxCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sk-primary text-white">
                    {inboxCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 sm:gap-2 justify-end">
          {activeView === 'vault' && (
            <button
              onClick={onOpenSuggest}
              className="inline-flex items-center justify-center gap-2 bg-sk-secondary-container hover:bg-[#f0b48a] dark:bg-secondary dark:hover:bg-secondary/80 text-[#794e2e] dark:text-secondary-foreground font-semibold rounded-full transition-all duration-200 hover:scale-[1.02] h-9 sm:h-10 text-sm w-9 sm:w-auto sm:px-5"
              title="Suggest a recipe"
            >
              <Wand2 className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Suggest</span>
            </button>
          )}
          <button
            onClick={toggle}
            className="p-2 sm:p-2.5 rounded-full text-sk-outline dark:text-muted-foreground hover:text-sk-primary dark:hover:text-primary hover:bg-sk-surface-low dark:hover:bg-muted transition-colors"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2 sm:p-2.5 rounded-full text-sk-outline dark:text-muted-foreground hover:text-sk-primary dark:hover:text-primary hover:bg-sk-surface-low dark:hover:bg-muted transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={onAddRecipe}
            className="inline-flex items-center justify-center gap-2 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/80 text-white font-semibold rounded-full shadow-ambient transition-all duration-200 hover:scale-[1.02] h-9 sm:h-10 text-sm w-9 sm:w-auto sm:px-6"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Add Recipe</span>
          </button>
          {user && <UserMenu user={user} onSignOut={onSignOut} />}
        </div>
      </header>

      {/* Subtle tonal divider instead of hard border */}
      <div className="h-px bg-gradient-to-r from-transparent via-sk-outline-variant/30 to-transparent -mt-6 mb-2" />

      {children}

      <footer className="pt-8 pb-4 flex justify-center print:hidden">
        <span className="flex items-center gap-1.5 text-xs font-sans text-sk-outline dark:text-muted-foreground">
          <svg className="w-3.5 h-3.5 text-sk-primary" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <circle cx="5" cy="5" r="1.2" fill="currentColor"/>
            <line x1="7.5" y1="6.5" x2="13" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Speisekammer · <span className="font-semibold text-sk-on-surface-variant dark:text-foreground">Magical Apps</span>
        </span>
      </footer>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-sk-surface dark:bg-card border-t border-sk-outline-variant/20 dark:border-border lg:hidden safe-area-bottom shadow-ambient">
        <div className="flex justify-around items-center h-14 max-w-lg mx-auto">
          {MOBILE_TABS.map(({ view, icon: Icon, label }) => {
            const isActive = activeView === view;
            return (
              <button
                key={view}
                onClick={() => onSetView(view)}
                className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                  isActive
                    ? 'text-sk-primary dark:text-primary'
                    : 'text-sk-outline dark:text-muted-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold font-sans">{label}</span>
                {view === 'inbox' && inboxCount > 0 && (
                  <span className="absolute top-1.5 left-1/2 ml-1.5 w-4 h-4 bg-sk-primary text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {inboxCount}
                  </span>
                )}
                {view === 'vault' && recipeCount > 0 && isActive && (
                  <span className="absolute top-1.5 left-1/2 ml-1.5 w-4 h-4 bg-sk-primary-fixed text-sk-on-primary-fixed text-[9px] font-bold rounded-full flex items-center justify-center">
                    {recipeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
