import { ChefHat, Plus, Settings, Wand2, Sun, Moon, Inbox, CalendarDays, ShoppingCart, BookOpen } from 'lucide-react';
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
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-4 border-b pb-4 sm:pb-6 border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 sm:gap-3 text-zinc-900 dark:text-zinc-50">
          <ChefHat className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 text-orange-500" />
          <h1 className="text-xl sm:text-2xl md:text-4xl font-extrabold tracking-tight">Recipe Vault</h1>
        </div>
        <div className="hidden lg:flex justify-center">
          <div className="flex bg-zinc-200/50 dark:bg-zinc-800/50 rounded-full p-1">
            {(['vault', 'planner', 'shopping', 'inbox'] as const).map((view) => (
              <button
                key={view}
                onClick={() => onSetView(view)}
                className={`px-5 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-1.5 ${
                  activeView === view
                    ? 'bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {view === 'vault' ? 'Vault' : view === 'planner' ? 'Meal Planner' : view === 'shopping' ? 'Shopping' : 'Inbox'}
                {view === 'vault' && recipeCount > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeView === 'vault' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400' : 'bg-zinc-300/60 dark:bg-zinc-700 text-zinc-500'}`}>
                    {recipeCount}
                  </span>
                )}
                {view === 'inbox' && inboxCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500 text-white">
                    {inboxCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 justify-end">
          {activeView === 'vault' && (
            <button
              onClick={onOpenSuggest}
              className="inline-flex items-center justify-center gap-2 bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 dark:text-purple-300 font-bold rounded-full shadow-sm transition-transform hover:scale-105 h-9 sm:h-10 text-sm border border-purple-200 dark:border-purple-800/50 w-9 sm:w-auto sm:px-5"
            >
              <Wand2 className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">Suggest</span>
            </button>
          )}
          <button
            onClick={toggle}
            className="p-2 sm:p-2.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2 sm:p-2.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={onAddRecipe}
            className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-full shadow-md transition-transform hover:scale-105 h-9 sm:h-10 text-sm w-9 sm:w-auto sm:px-6"
          >
            <Plus className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">Add Recipe</span>
          </button>
          {user && <UserMenu user={user} onSignOut={onSignOut} />}
        </div>
      </header>
      {children}

      <footer className="pt-8 pb-4 flex justify-center print:hidden">
        <span className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-600">
          <ChefHat className="w-3.5 h-3.5 text-orange-400" />
          Designed by <span className="font-semibold text-zinc-500 dark:text-zinc-500">Magical Apps</span> · Thomas Holder
        </span>
      </footer>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 lg:hidden safe-area-bottom">
        <div className="flex justify-around items-center h-14 max-w-lg mx-auto">
          {MOBILE_TABS.map(({ view, icon: Icon, label }) => {
            const isActive = activeView === view;
            return (
              <button
                key={view}
                onClick={() => onSetView(view)}
                className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                  isActive
                    ? 'text-orange-500'
                    : 'text-zinc-400 active:text-zinc-600 dark:active:text-zinc-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold">{label}</span>
                {view === 'inbox' && inboxCount > 0 && (
                  <span className="absolute top-1.5 left-1/2 ml-1.5 w-4 h-4 bg-orange-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {inboxCount}
                  </span>
                )}
                {view === 'vault' && recipeCount > 0 && isActive && (
                  <span className="absolute top-1.5 left-1/2 ml-1.5 w-4 h-4 bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 text-[9px] font-bold rounded-full flex items-center justify-center">
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
