/** Words and dates for Admin → Usage (src/components/AdminUsage.tsx). */

/** What each gemini_logs endpoint is, for someone who uses the app. */
export const FEATURE_LABELS: Record<string, string> = {
  extract: 'Recipe from a link',
  'extract-photo': 'Recipe from a photo',
  'extract-screenshot': 'Recipe from a screenshot',
  'extract-pdf': 'Recipe from a PDF',
  'extract-text': 'Recipe from pasted text',
  'extract-page': 'Safari page (iPhone Shortcut)',
  'extract-link': 'Shared link (iPhone Shortcut)',
  tag: 'Tags, after saving',
  nutrition: 'Nutrition, after saving',
  translate: 'Translation',
  scale: 'Scaling',
  suggest: 'What can I cook?',
  shopping: 'Shopping list from the plan',
  'find-image': 'Cover picture search',
};

export const IMPORT_LABELS: Record<string, string> = {
  photos: 'Photos',
  page: 'Safari page',
  link: 'Shared link',
};

export function featureLabel(endpoint: string): string {
  return FEATURE_LABELS[endpoint] ?? endpoint;
}

/** "16 Nov", for a YYYY-MM-DD in UTC (the report's days are UTC days). */
export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

