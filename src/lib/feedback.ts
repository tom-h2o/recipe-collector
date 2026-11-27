import * as Sentry from '@sentry/react';
import { supabase } from '@/lib/supabase';
import type { FeedbackContext, FeedbackKind } from '@/types';
import { msg, t } from '@/i18n';

/**
 * Feedback and bug reports sent from inside the app (migration 0078).
 *
 * A report is the person's text plus a little context the app gathers, which
 * is shown to them before it is sent. It is written straight to the
 * `feedback` table under RLS; the admin reads it in the dashboard.
 */
export const MAX_FEEDBACK_LENGTH = 4000;

export const FEEDBACK_KINDS: { id: FeedbackKind; label: string }[] = [
  { id: 'bug', label: msg('Something is broken') },
  { id: 'idea', label: msg('An idea') },
  { id: 'other', label: msg('Something else') },
];

/** The build this page is running: the deployed commit, shortened. */
function buildId(): string {
  const release = typeof __SENTRY_RELEASE__ === 'string' ? __SENTRY_RELEASE__ : '';
  return release ? release.slice(0, 12) : 'local';
}

/**
 * What the app adds to a report. No address, no recipe content, and never the
 * `#…` part of the page address, which can hold a sign-in token.
 */
export function collectFeedbackContext(view?: string, error?: string): FeedbackContext {
  const context: FeedbackContext = { build: buildId() };
  if (view) context.view = view;
  if (typeof window !== 'undefined') {
    context.path = window.location.pathname;
    context.screen = `${window.innerWidth}×${window.innerHeight}`;
    context.installed = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
    context.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    context.language = navigator.language;
    context.userAgent = navigator.userAgent.slice(0, 300);
  }
  const lastErrorId = Sentry.lastEventId();
  if (lastErrorId) context.lastErrorId = lastErrorId;
  if (error) context.error = error.slice(0, 500);
  return context;
}

/** The context as the lines shown under "Sent along with it". */
export function describeFeedbackContext(context: FeedbackContext): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];
  const add = (label: string, value: string | undefined) => { if (value) lines.push({ label, value }); };
  add(t('App version'), context.build);
  add(t('Where you are'), [context.view, context.path].filter(Boolean).join(' · '));
  add(t('Screen'), [
    context.screen,
    context.theme === 'dark' ? t('dark') : context.theme === 'light' ? t('light') : context.theme,
    context.installed ? t('installed app') : t('browser'),
  ].filter(Boolean).join(' · '));
  add(t('Language'), context.language);
  add(t('Device'), context.userAgent);
  add(t('Last error'), context.lastErrorId);
  add(t('Error'), context.error);
  return lines;
}

/**
 * Sends a report. Returns an error in words for the person, or null.
 * user_id and status are set by the database (the browser may not send them).
 */
export async function submitFeedback(kind: FeedbackKind, message: string, context: FeedbackContext): Promise<string | null> {
  const text = message.trim();
  if (!text) return t('Please write a few words first.');
  if (text.length > MAX_FEEDBACK_LENGTH) return t('Please keep it under {max} characters.', { max: MAX_FEEDBACK_LENGTH });
  const { error } = await supabase.from('feedback').insert({ kind, message: text, context });
  if (!error) return null;
  // 42501: refused by the row policy. For a signed-in person that is the
  // daily bound; the other conditions cannot be reached from this form.
  if (error.code === '42501') return t('That is a lot of feedback for one day. Please send the rest tomorrow.');
  return t('The feedback could not be sent. Please try again in a moment.');
}
