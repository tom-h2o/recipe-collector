import { ChefHat, Plus, Settings, Wand2 } from 'lucide-react';
import type { ActiveView } from '@/types';

interface Props {
  activeView: ActiveView;
  onSetView: (v: ActiveView) => void;
  onOpenSettings: () => void;
  onOpenSuggest: () => void;
  onAddRecipe: () => void;
  children: React.ReactNode;
}

export function Layout({ activeView, onSetView, onOpenSettings, onOpenSuggest, onAddRecipe, children }: Props) {
  return (
    <div className="max-w-6xl mx-auto space-y-8 print:hidden">
      <header className="relative flex items-center justify-between border-b pb-6 border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3 text-zinc-900 dark:text-zinc-50">
          <ChefHat className="w-8 h-8 md:w-10 md:h-10 text-orange-500" />
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight">Recipe Vault</h1>
        </div>
        <div className="hidden lg:flex bg-zinc-200/50 dark:bg-zinc-800/50 rounded-full p-1 absolute left-1/2 -translate-x-1/2">
          {(['vault', 'planner', 'shopping'] as const).map((view) => (
            <button
              key={view}
              onClick={() => onSetView(view)}
              className={`px-5 py-1.5 rounded-full text-sm font-bold transition-all ${
                activeView === view
                  ? 'bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-white'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {view === 'vault' ? 'Vault' : view === 'planner' ? 'Meal Planner' : 'Shopping List'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSuggest}
            className="inline-flex items-center justify-center gap-2 bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 dark:text-purple-300 font-bold rounded-full px-5 shadow-sm transition-transform hover:scale-105 h-10 text-sm border border-purple-200 dark:border-purple-800/50"
          >
            <Wand2 className="w-4 h-4" /> Suggest
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={onAddRecipe}
            className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-full px-6 shadow-md transition-transform hover:scale-105 h-10 text-sm"
          >
            <Plus className="w-4 h-4" /> Add Recipe
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
