import { Check, X, Inbox, ChefHat, ArrowLeft } from 'lucide-react';
import type { RecipeShare } from '@/types';

interface Props {
  shares: RecipeShare[];
  onAccept: (share: RecipeShare) => void;
  onReject: (share: RecipeShare) => void;
  onBack: () => void;
}

export function RecipeInbox({ shares, onAccept, onReject, onBack }: Props) {
  if (shares.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24 animate-in fade-in duration-500">
        <Inbox className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
        <p className="text-xl font-bold text-zinc-500 dark:text-zinc-400">Your inbox is empty</p>
        <p className="text-sm text-zinc-400 mt-2">When someone sends you a recipe it will appear here.</p>
        <button
          onClick={onBack}
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-orange-500 hover:text-orange-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Vault
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          title="Back to Vault"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
          <Inbox className="w-6 h-6 text-orange-500" />
          Recipe Inbox
          <span className="text-sm font-semibold px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full">
            {shares.length}
          </span>
        </h2>
      </div>

      {shares.map((share) => (
        <div
          key={share.id}
          className="bg-white dark:bg-zinc-900/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden flex"
        >
          {/* Recipe image */}
          {share.recipe_image_url ? (
            <img
              src={share.recipe_image_url}
              alt={share.recipe_title}
              className="w-28 h-28 object-cover shrink-0"
            />
          ) : (
            <div className="w-28 h-28 shrink-0 bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
              <ChefHat className="w-10 h-10 text-orange-300 dark:text-orange-700" />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0 p-4 flex flex-col justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-zinc-900 dark:text-zinc-50 truncate">{share.recipe_title}</p>
              {share.recipe_description && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5">{share.recipe_description}</p>
              )}
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                From <span className="font-semibold text-zinc-600 dark:text-zinc-300">{share.sender_email}</span>
                {' · '}
                {new Date(share.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => onAccept(share)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <Check className="w-4 h-4" /> Add to vault
              </button>
              <button
                onClick={() => onReject(share)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-sm font-semibold rounded-xl transition-colors"
              >
                <X className="w-4 h-4" /> Decline
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
