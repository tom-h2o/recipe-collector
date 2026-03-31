import { useState, useRef, useEffect } from 'react';
import { Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Recipe, Contact } from '@/types';

interface Props {
  recipe: Recipe;
  contacts: Contact[];
  isOpen: boolean;
  onClose: () => void;
  onSend: (recipe: Recipe, recipientEmail: string) => Promise<boolean>;
}

export function SendRecipeModal({ recipe, contacts, isOpen, onClose, onSend }: Props) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setError(null);
      setShowSuggestions(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const suggestions = email.length >= 1
    ? contacts.filter((c) => c.contact_email.includes(email.toLowerCase())).slice(0, 5)
    : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const ok = await onSend(recipe, email.trim());
      if (ok) onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Send recipe</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 truncate max-w-[220px]">{recipe.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5 relative">
            <Label htmlFor="recipient-email" className="font-semibold text-zinc-700 dark:text-zinc-300">
              Recipient email
            </Label>
            <Input
              ref={inputRef}
              id="recipient-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="friend@example.com"
              required
              autoComplete="off"
              className={error ? 'border-red-400 focus-visible:ring-red-400' : ''}
            />
            {/* Contact autocomplete */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg z-10 overflow-hidden">
                {suggestions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => { setEmail(c.contact_email); setShowSuggestions(false); }}
                    className="w-full text-left px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  >
                    {c.contact_email}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            The recipient will see this recipe in their inbox and can choose to add it to their vault.
          </p>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Send className="w-4 h-4 mr-2" />
              {isSubmitting ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
