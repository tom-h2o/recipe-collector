/** Words and dates for Admin → Usage (src/components/AdminUsage.tsx). */

import { msg, dateLocale } from '@/i18n';

/** What each gemini_logs endpoint is, for someone who uses the app. */
export const FEATURE_LABELS: Record<string, string> = {
  extract: msg('Recipe from a link'),
  'extract-photo': msg('Recipe from a photo'),
  'extract-screenshot': msg('Recipe from a screenshot'),
  'extract-pdf': msg('Recipe from a PDF'),
  'extract-text': msg('Recipe from pasted text'),
  'extract-page': msg('Safari page (iPhone Shortcut)'),
  'extract-link': msg('Shared link (iPhone Shortcut)'),
  tag: msg('Tags, after saving'),
  nutrition: msg('Nutrition, after saving'),
  translate: msg('Translation'),
  scale: msg('Scaling'),
  suggest: msg('What can I cook?'),
  shopping: msg('Shopping list from the plan'),
  'find-image': msg('Cover picture search'),
};

export const IMPORT_LABELS: Record<string, string> = {
  photos: msg('Photos'),
  page: msg('Safari page'),
  link: msg('Shared link'),
};

export function featureLabel(endpoint: string): string {
  return FEATURE_LABELS[endpoint] ?? endpoint;
}

/** "16 Nov", for a YYYY-MM-DD in UTC (the report's days are UTC days). */
export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

