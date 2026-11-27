import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  FEEDBACK_KINDS, MAX_FEEDBACK_LENGTH, collectFeedbackContext, describeFeedbackContext, submitFeedback,
} from '@/lib/feedback';
import { chipClass } from '@/lib/tags';
import type { FeedbackKind } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** The view the person was on (Vault, Meal Planner…), added to the report. */
  view?: string;
}

/**
 * "Send feedback" from the account menu: what kind, the text, and the context
 * the app adds, shown before sending so nothing travels unseen. Errors appear
 * in the form and the text is kept; only success is a toast.
 */
export function FeedbackDialog({ isOpen, onClose, view }: Props) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Gathered when the form opens, so what is shown is what is sent.
  const context = useMemo(() => (isOpen ? collectFeedbackContext(view) : {}), [isOpen, view]);

  // The text is kept when the form is closed without sending; an old error is not.
  function close() {
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSending(true);
    setError(null);
    const failure = await submitFeedback(kind, message, context);
    setIsSending(false);
    if (failure) { setError(failure); return; }
    toast.success('Thank you! Your feedback was sent.');
    setMessage('');
    setKind('bug');
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent
        showCloseButton={false}
        initialFocus={textRef}
        className="w-[calc(100%-2rem)] sm:max-w-md max-h-[var(--dialog-max-h)] overflow-y-auto bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 gap-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Send feedback</DialogTitle>
            <DialogDescription className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              A fault, an idea, anything. It goes to the person who runs Speisekammer.
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div role="radiogroup" aria-label="What is it about?" className="flex flex-wrap gap-2">
            {FEEDBACK_KINDS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={kind === option.id}
                onClick={() => setKind(option.id)}
                className={chipClass(kind === option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="feedback-message" className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {kind === 'bug' ? 'What happened, and what did you expect?' : 'Your message'}
            </label>
            <textarea
              id="feedback-message"
              ref={textRef}
              value={message}
              onChange={(e) => { setMessage(e.target.value); setError(null); }}
              rows={5}
              required
              maxLength={MAX_FEEDBACK_LENGTH}
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sk-primary/40"
            />
          </div>

          <details className="text-xs text-zinc-500 dark:text-zinc-400">
            <summary className="cursor-pointer font-semibold text-zinc-600 dark:text-zinc-300">Sent along with it</summary>
            <dl className="mt-2 space-y-1">
              {describeFeedbackContext(context).map((line) => (
                <div key={line.label} className="flex gap-2">
                  <dt className="shrink-0 w-24 text-zinc-400 dark:text-zinc-500">{line.label}</dt>
                  <dd className="min-w-0 break-words">{line.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2">None of your recipes are attached.</p>
          </details>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={close} className="flex-1">Cancel</Button>
            <Button
              type="submit"
              disabled={isSending || !message.trim()}
              className="flex-1 bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground border-0"
            >
              {isSending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
