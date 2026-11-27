import * as Sentry from '@sentry/react';
import { supabase } from '@/lib/supabase';
import type { FeedbackContext, FeedbackKind } from '@/types';

/**
 * Feedback and bug reports sent from inside the app (migration 0078).
 *
 * A report is the person's text plus a little context the app gathers, which
 * is shown to them before it is sent. It is written straight to the
 * `feedback` table under RLS; the admin reads it in the dashboard.
 */
export const MAX_FEEDBACK_LENGTH = 4000;

export const FEEDBACK_KINDS: { id: FeedbackKind; label: string }[] = [
  { id: 'bug', label: 'Something is broken' },
  { id: 'idea', label: 'An idea' },
  { id: 'other', label: 'Something else' },
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
  add('App version', context.build);
  add('Where you are', [context.view, context.path].filter(Boolean).join(' · '));
  add('Screen', [context.screen, context.theme, context.installed ? 'installed app' : 'browser'].filter(Boolean).join(' · '));
  add('Language', context.language);
  add('Device', context.userAgent);
  add('Last error', context.lastErrorId);
  add('Error', context.error);
  return lines;
}

/**
 * Sends a report. Returns an error in words for the person, or null.
 * user_id and status are set by the database (the browser may not send them).
 */
export async function submitFeedback(kind: FeedbackKind, message: string, context: FeedbackContext): Promise<string | null> {
  const text = message.trim();
  if (!text) return 'Please write a few words first.';
  if (text.length > MAX_FEEDBACK_LENGTH) return `Please keep it under ${MAX_FEEDBACK_LENGTH} characters.`;
  const { error } = await supabase.from('feedback').insert({ kind, message: text, context });
  if (!error) return null;
  // 42501: refused by the row policy. For a signed-in person that is the
  // daily bound; the other conditions cannot be reached from this form.
  if (error.code === '42501') return 'That is a lot of feedback for one day. Please send the rest tomorrow.';
  return 'The feedback could not be sent. Please try again in a moment.';
}
