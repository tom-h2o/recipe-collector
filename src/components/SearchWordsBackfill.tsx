import { useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { translateMessage, useT } from '@/i18n';

interface Answer { done: number; failed: string[]; remaining: number }

/**
 * Admin → System: German and English search words for recipes that were
 * tagged before the search could use them (migration 0080).
 *
 * Nothing is sent until the button is pressed: each recipe costs one small AI
 * call. The server reads a few recipes per request and says how many are left;
 * this repeats the request until none are, a request fails, or Stop is
 * pressed. A recipe that fails is left out of the rest of the run, so one bad
 * recipe cannot stall it. Tags are not changed.
 */
export function SearchWordsBackfill() {
  const t = useT();
  const [running, setRunning] = useState(false);
  const [added, setAdded] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  async function run() {
    stop.current = false;
    setRunning(true);
    setError(null);
    setAdded(0);
    setFailed(0);
    const skip: string[] = [];
    try {
      for (;;) {
        const res = await apiFetch('/api/account?action=search-words', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 3, skip }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(translateMessage(body.error ?? 'Request failed.'));
        const answer = body as Answer;
        skip.push(...answer.failed);
        setAdded((n) => n + answer.done);
        setFailed(skip.length);
        setRemaining(answer.remaining);
        // Nothing left, nothing more that can be tried, or asked to stop.
        if (answer.remaining === 0 || answer.done + answer.failed.length === 0 || skip.length >= 200 || stop.current) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Request failed.'));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section aria-labelledby="search-words-title" className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 space-y-3">
      <h3 id="search-words-title" className="text-sm font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
        <Search className="w-4 h-4 text-sk-primary dark:text-primary" aria-hidden="true" />
        {t('Search words for existing recipes')}
      </h3>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">
        {t('New recipes get German and English search words when they are tagged, so “eggs” finds “Eier”. Recipes saved before that have none. This adds them: one small AI call per recipe, outside the daily limit. Tags are not changed.')}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {running ? (
          <Button variant="outline" onClick={() => { stop.current = true; }} className="gap-1.5">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            {t('Stop')}
          </Button>
        ) : (
          <Button variant="outline" onClick={run}>{t('Add search words')}</Button>
        )}
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-300">
          {remaining === null
            ? (running ? t('Working…') : '')
            : remaining === 0 && failed === 0
              ? t('Done. {added} added; every recipe has search words.', { added })
              : t('{added} added, {remaining} left.', { added, remaining })}
          {failed > 0 && ` ${t('{failed} could not be read.', { failed })}`}
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </section>
  );
}
