/**
 * German: words used all over the app. A key defined here must not be defined
 * again in another file of this folder (src/i18n/i18n.test.ts fails on two
 * different translations of one key).
 *
 * House rules: "du", never "Sie". "Vault" and "Inbox" keep their English
 * names; the planner is "Plan" (it was "Wochenplan" until the owner asked
 * for the shorter name), shopping is "Einkauf", the pantry list
 * is "Vorrat". Typographic quotes are „…“.
 */
const common: Record<string, string> = {
  // Navigation and names
  'Vault': 'Vault',
  'Inbox': 'Inbox',
  'Planner': 'Plan',
  'Meal Planner': 'Plan',
  'Shopping': 'Einkauf',
  'Shopping list': 'Einkaufsliste',
  'Pantry': 'Vorrat',
  'Admin': 'Admin',
  'Settings': 'Einstellungen',
  'Suggest': 'Vorschlag',
  'Cook': 'Kochen',
  'Cook mode': 'Kochmodus',
  'Collections': 'Sammlungen',
  'Collection': 'Sammlung',

  // Actions
  'Cancel': 'Abbrechen',
  'Save': 'Speichern',
  'Saving…': 'Speichert…',
  'Delete': 'Löschen',
  'Remove': 'Entfernen',
  'Edit': 'Bearbeiten',
  'Close': 'Schließen',
  'Back': 'Zurück',
  'Next': 'Weiter',
  'Done': 'Fertig',
  'Add': 'Hinzufügen',
  'Add##recipe': 'Neu',
  'Add recipe': 'Rezept hinzufügen',
  'Add Recipe': 'Rezept hinzufügen',
  'Copy': 'Kopieren',
  'Copied': 'Kopiert',
  'Share': 'Teilen',
  'Send': 'Senden',
  'Sending…': 'Sendet…',
  'Print': 'Drucken',
  'Search': 'Suchen',
  'Clear': 'Zurücksetzen',
  'Try again': 'Erneut versuchen',
  'Reload': 'Neu laden',
  'Show': 'Anzeigen',
  'Dismiss': 'Ausblenden',
  'Accept': 'Annehmen',
  'Decline': 'Ablehnen',
  'Confirm': 'Bestätigen',
  'Loading…': 'Lädt…',
  'Load more': 'Mehr laden',
  'Yes': 'Ja',
  'No': 'Nein',
  'OK': 'OK',

  // Recipe words
  'Recipe': 'Rezept',
  'Recipes': 'Rezepte',
  'Ingredients': 'Zutaten',
  'Instructions': 'Zubereitung',
  'Nutrition': 'Nährwerte',
  'Servings': 'Portionen',
  'Notes': 'Notizen',
  'Tags': 'Tags',
  'Favourites': 'Favoriten',
  'Shared': 'Geteilt',
  'Source': 'Quelle',
  'Title': 'Titel',
  'Description': 'Beschreibung',
  'Translation': 'Übersetzung',
  'Today': 'Heute',
  'Tomorrow': 'Morgen',
  'Email': 'E-Mail',
  'Password': 'Passwort',
  'Language': 'Sprache',

  // Meal types (stored in English, shown translated)
  'Breakfast': 'Frühstück',
  'Lunch': 'Mittagessen',
  'Dinner': 'Abendessen',
  'Snack': 'Snack',
};

export default common;
