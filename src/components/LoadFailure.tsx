import { useState } from 'react';
import { APP_NAME } from '@/lib/appInfo';
import { dropServiceWorker, looksLikeAMissingChunk, recoveryInProgress } from '@/lib/recoverFromStaleChunks';
import { collectFeedbackContext, submitFeedback } from '@/lib/feedback';
import { useT } from '@/i18n';

/**
 * What the app shows when it cannot render at all.
 *
 * Before this existed the lazy views sat under no error boundary, so a view
 * whose file would not load left a white page: no message, nothing to press.
 * By the time it is visible, recoverFromStaleChunks.ts has already spent its
 * one automatic reload. It names the file that failed, which is the one fact
 * that tells a stale cache from a blocked request, and offers the two things
 * left to try by hand.
 */
export function LoadFailure({ error }: { error: Error }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const missingFile = looksLikeAMissingChunk(error.message);

  // An automatic recovery reload is already on its way; a failure screen that
  // flashes up for the moment before it lands reads as a second fault.
  if (recoveryInProgress()) {
    return <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">{t('Updating…')}</div>;
  }

  async function resetAndReload() {
    setBusy(true);
    await dropServiceWorker();
    window.location.reload();
  }

  // One tap, no form: this screen appears when the app cannot draw itself, so
  // the report is the error and where it happened. Needs a signed-in session;
  // without one it says it could not be sent.
  async function reportProblem() {
    setReport('sending');
    const failure = await submitFeedback(
      'bug',
      missingFile ? 'The app could not load one of its files.' : 'The app showed its failure screen.',
      collectFeedbackContext('failure screen', error.message || 'unknown error'),
    ).catch(() => 'failed');
    setReport(failure ? 'failed' : 'sent');
  }

  return (
    <div role="alert" className="min-h-screen flex items-center justify-center p-6 bg-white dark:bg-zinc-950">
      <div className="max-w-md w-full space-y-4 text-center">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          {missingFile ? t('Part of {app} could not be loaded', { app: APP_NAME }) : t('{app} ran into a problem', { app: APP_NAME })}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {missingFile
            ? t('A file the app needs did not arrive. Reloading usually fixes this after an update. If it keeps happening in this browser only, something in the browser is holding on to an old copy or stopping the file: try the reset below.')
            : t('Something went wrong while showing this page. Reloading usually helps.')}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            disabled={busy}
            className="px-4 py-2.5 rounded-full bg-sk-primary text-white text-sm font-semibold disabled:opacity-50"
          >
            {t('Reload')}
          </button>
          <button
            type="button"
            onClick={resetAndReload}
            disabled={busy}
            className="px-4 py-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? t('Resetting…') : t('Reset saved app files and reload')}
          </button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 break-words">
          {t('Your recipes are not affected. Details: {details}', { details: error.message || t('unknown error') })}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
          {report === 'sent' ? t('Reported. Thank you.') : report === 'failed' ? t('The report could not be sent from here.') : (
            <button
              type="button"
              onClick={reportProblem}
              disabled={report === 'sending'}
              className="underline font-semibold text-zinc-700 dark:text-zinc-200 disabled:opacity-50"
            >
              {report === 'sending' ? t('Reporting…') : t('Report this problem')}
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
