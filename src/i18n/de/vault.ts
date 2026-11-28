/** German: see index.ts for which part of the app this file covers. */
const vault: Record<string, string> = {
  // ── App shell (App.tsx, Layout) ────────────────────────────────────────────
  'Loading...': 'Lädt…',
  'Could not save that change.': 'Die Änderung konnte nicht gespeichert werden.',
  "This link isn't available": 'Dieser Link ist nicht verfügbar',
  'The recipe may have been unshared by its owner, or the link may be incomplete. Ask whoever sent it for a fresh link.':
    'Vielleicht wurde die Freigabe des Rezepts aufgehoben, oder der Link ist unvollständig. Bitte die Person, die ihn geschickt hat, um einen neuen Link.',
  'Delete Recipe?': 'Rezept löschen?',
  'Are you sure you want to delete <b>"{title}"</b>? This action cannot be undone.':
    'Möchtest du <b>„{title}“</b> wirklich löschen? Das lässt sich nicht rückgängig machen.',
  'Recipe Vault': 'Rezept-Vault',
  'Suggest a recipe': 'Rezept vorschlagen lassen',

  // ── Vault (RecipeVault) ────────────────────────────────────────────────────
  'Search recipes, ingredients…': 'Rezepte, Zutaten suchen…',
  'Search recipes': 'Rezepte suchen',
  'Press / to search': 'Zum Suchen / drücken',
  'Clear search': 'Suche leeren',
  'Whose recipes': 'Wessen Rezepte',
  'Everyone': 'Alle',
  'Mine': 'Meine',
  'The recipes could not be loaded': 'Die Rezepte konnten nicht geladen werden',
  'Nothing is lost. Check the connection and try again.': 'Es ist nichts verloren. Prüfe die Verbindung und versuche es noch einmal.',
  'The vault is empty': 'Der Vault ist leer',
  'Click <b>Add Recipe</b> or press <kbd>n</kbd> to get started!':
    'Klicke auf <b>Rezept hinzufügen</b> oder drücke <kbd>n</kbd>, um loszulegen!',
  '{name} is empty': '{name} ist leer',
  'This collection is empty': 'Diese Sammlung ist leer',
  'Open a recipe and use <b>⋯ → Add to collection</b> to populate it.':
    'Öffne ein Rezept und füge es über <b>⋯ → Zur Sammlung hinzufügen</b> hinzu.',
  'No results found': 'Keine Treffer',
  'Try a different search or clear the filters.': 'Versuche eine andere Suche oder setze die Filter zurück.',

  // ── Filters (FilterBar) ────────────────────────────────────────────────────
  'Filters': 'Filter',
  'Filters, {n} chosen': 'Filter, {n} gewählt',
  'Clear search and filters': 'Suche und Filter zurücksetzen',
  'Clear {group} filter': 'Filter „{group}“ entfernen',
  'One per group. Together they narrow the list: Vegetarian and Italian shows recipes that are both.':
    'Einer pro Gruppe. Zusammen grenzen sie die Liste ein: Vegetarisch und Italienisch zeigt Rezepte, die beides sind.',
  'Show recipes': 'Rezepte anzeigen',

  // ── Collections (CollectionBar) ────────────────────────────────────────────
  'The collection could not be created. Please try again.': 'Die Sammlung konnte nicht angelegt werden. Bitte versuche es noch einmal.',
  'The name could not be saved. Please try again.': 'Der Name konnte nicht gespeichert werden. Bitte versuche es noch einmal.',
  'The collection could not be deleted. Please try again.': 'Die Sammlung konnte nicht gelöscht werden. Bitte versuche es noch einmal.',
  'New collection': 'Neue Sammlung',
  'Edit collections': 'Sammlungen bearbeiten',
  'A named group of recipes, such as “Weeknight” or “For guests”. Add recipes to it from a recipe’s ⋯ menu.':
    'Eine benannte Gruppe von Rezepten, etwa „Feierabend“ oder „Für Gäste“. Rezepte fügst du über das ⋯-Menü eines Rezepts hinzu.',
  'Collection name': 'Name der Sammlung',
  'Creating…': 'Wird angelegt…',
  'Create': 'Anlegen',
  'Delete “{name}”?': '„{name}“ löschen?',
  'Only the collection goes. Its recipe stays in your vault.': 'Nur die Sammlung wird gelöscht. Das Rezept darin bleibt in deinem Vault.',
  'Only the collection goes. Its {n} recipes stay in your vault.': 'Nur die Sammlung wird gelöscht. Die {n} Rezepte darin bleiben in deinem Vault.',
  'It has no recipes in it.': 'Die Sammlung enthält keine Rezepte.',
  'Rename or delete a collection. Recipes are never deleted with it.':
    'Sammlung umbenennen oder löschen. Rezepte werden dabei nie gelöscht.',
  'Keep it': 'Behalten',
  'Deleting…': 'Löscht…',
  'New name for {name}': 'Neuer Name für {name}',
  'Rename {name}': '{name} umbenennen',
  'Delete {name}': '{name} löschen',
  '{n} recipe': '{n} Rezept',
  '{n} recipes': '{n} Rezepte',

  // ── Sorting (SortButton, SORT_OPTIONS) ─────────────────────────────────────
  'Sort recipes: {label}': 'Rezepte sortieren: {label}',
  'Sorted: {label}': 'Sortiert: {label}',
  'Newest first': 'Neueste zuerst',
  'Oldest first': 'Älteste zuerst',
  'A → Z': 'A → Z',
  'Z → A': 'Z → A',
  'Highest rated': 'Beste Bewertung',
  'Favourites first': 'Favoriten zuerst',

  // ── Recipe card ────────────────────────────────────────────────────────────
  'View Recipe': 'Rezept ansehen',
  'Unfavourite': 'Aus Favoriten entfernen',
  'Favourite': 'Als Favorit markieren',
  'Sent from your iPhone and not opened yet': 'Von deinem iPhone gesendet und noch nicht geöffnet',
  'New': 'Neu',
  'This recipe has a public link anyone can open': 'Dieses Rezept hat einen öffentlichen Link, den jeder öffnen kann',
  'Processing…': 'Wird verarbeitet…',
  'Translating…': 'Wird übersetzt…',
  'No description provided.': 'Keine Beschreibung vorhanden.',
  '{n} Ingredient': '{n} Zutat',
  '{n} Ingredients': '{n} Zutaten',
  ' · +{n} more': ' · +{n} weitere',
  // On the card's narrow footer; the recipe itself has its own, longer wording.
  'Serves {n}##card': '{n} Port.',
  '{n}m': '{n} Min.',

  // ── Imports from the iPhone (ImportBanner) ─────────────────────────────────
  'Recipes from your iPhone': 'Rezepte von deinem iPhone',
  '1 new recipe from your iPhone': '1 neues Rezept von deinem iPhone',
  '{n} new recipes from your iPhone': '{n} neue Rezepte von deinem iPhone',
  'Reading a page from Safari…': 'Eine Seite aus Safari wird gelesen…',
  'Reading a shared link…': 'Ein geteilter Link wird gelesen…',
  'Reading a picture from your photos…': 'Ein Bild aus deinen Fotos wird gelesen…',
  'Reading {n} pages from your photos…': '{n} Seiten aus deinen Fotos werden gelesen…',
  'Reading {n} recipes from your iPhone…': '{n} Rezepte von deinem iPhone werden gelesen…',
  'A page from Safari could not be read.': 'Eine Seite aus Safari konnte nicht gelesen werden.',
  'A shared link could not be read.': 'Ein geteilter Link konnte nicht gelesen werden.',
  'A picture could not be read.': 'Ein Bild konnte nicht gelesen werden.',
  '{n} pages could not be read.': '{n} Seiten konnten nicht gelesen werden.',

  // ── Reading a recipe (VaultAnimation) ──────────────────────────────────────
  'In the vault': 'Im Vault',
  'Long recipes can take up to a minute.': 'Lange Rezepte können bis zu einer Minute dauern.',

  // ── Filter chips and tags (src/lib/tags.ts; stored values stay English) ────
  'New from iPhone': 'Neu vom iPhone',
  'Under 30 min': 'Unter 30 Min.',
  // Groups
  'Diet': 'Ernährung',
  'Cuisine': 'Küche',
  'Meal': 'Gericht',
  'Main ingredient': 'Hauptzutat',
  'More': 'Mehr',
  // Diet
  'Vegetarian': 'Vegetarisch',
  'Vegan': 'Vegan',
  'Gluten-Free': 'Glutenfrei',
  'Dairy-Free': 'Milchfrei',
  'High Protein': 'Proteinreich',
  'Low Carb': 'Low Carb',
  // Cuisine
  'German': 'Deutsch',
  'Italian': 'Italienisch',
  'Mediterranean': 'Mediterran',
  'Asian': 'Asiatisch',
  'Indian': 'Indisch',
  'Mexican': 'Mexikanisch',
  'American': 'Amerikanisch',
  // Meal (Breakfast, Lunch, Dinner and Snack are in common.ts)
  'Dessert': 'Dessert',
  'Soup': 'Suppe',
  'Salad': 'Salat',
  'Pasta': 'Pasta',
  'Casserole': 'Auflauf',
  // Main ingredient
  'Chicken': 'Hähnchen',
  'Meat': 'Fleisch',
  'Fish & Seafood': 'Fisch & Meeresfrüchte',
  // More
  'One-Pot': 'One-Pot',
  'Baking': 'Backen',
  'Grilling': 'Grillen',
  'Meal Prep': 'Meal Prep',
  'Comfort Food': 'Soulfood',

  // ── Recipe languages (LANGUAGES[].name in constants.ts, shown via t(name)) ─
  'English': 'Englisch',
  'French': 'Französisch',
  'Spanish': 'Spanisch',

  // ── AI models (MODEL_OPTIONS) ──────────────────────────────────────────────
  'Fast': 'Schnell',
  'Recommended': 'Empfohlen',
  'Strongest': 'Am stärksten',
  'Backup': 'Reserve',
  'Paid plan': 'Kostenpflichtig',
  "Anthropic's fast, low-cost model. Plenty for tagging, scaling, shopping lists and suggestions. If it fails, the task runs on Gemini Lite instead.":
    'Das schnelle, günstige Modell von Anthropic. Reicht völlig für Tags, Umrechnen, Einkaufslisten und Vorschläge. Fällt es aus, läuft die Aufgabe stattdessen auf Gemini Lite.',
  "~$0.10 / $0.50 per 1M tokens, paid from the Claude plan's monthly API credit":
    'ca. 0,10 $ / 0,50 $ pro 1 Mio. Tokens, bezahlt aus dem monatlichen API-Guthaben des Claude-Plans',
  "Anthropic's everyday model and the main one here. Reads photos, PDFs and messy web pages reliably and translates well. If it fails, the task runs on Gemini Standard instead.":
    'Das Alltagsmodell von Anthropic und hier das Hauptmodell. Liest Fotos, PDFs und unordentliche Webseiten zuverlässig und übersetzt gut. Fällt es aus, läuft die Aufgabe stattdessen auf Gemini Standard.',
  "~$2 / $10 per 1M tokens, paid from the Claude plan's monthly API credit":
    'ca. 2 $ / 10 $ pro 1 Mio. Tokens, bezahlt aus dem monatlichen API-Guthaben des Claude-Plans',
  "Anthropic's most capable model of the three, for handwriting and awkward scans. Slower and twice the price of Sonnet. If it fails, the task runs on Gemini Standard instead.":
    'Das leistungsfähigste der drei Modelle von Anthropic, für Handschrift und schwierige Scans. Langsamer und doppelt so teuer wie Sonnet. Fällt es aus, läuft die Aufgabe stattdessen auf Gemini Standard.',
  "~$4 / $20 per 1M tokens, paid from the Claude plan's monthly API credit":
    'ca. 4 $ / 20 $ pro 1 Mio. Tokens, bezahlt aus dem monatlichen API-Guthaben des Claude-Plans',
  "Google's fastest and cheapest model, and the backup for Claude Haiku. Fine for tagging, nutrition and clean recipe pages. Can miss detail in handwriting or multi-page photos.":
    'Das schnellste und günstigste Modell von Google und die Reserve für Claude Haiku. Gut für Tags, Nährwerte und saubere Rezeptseiten. Kann bei Handschrift oder mehrseitigen Fotos Details übersehen.',
  '~$0.30 / $2.50 per 1M tokens': 'ca. 0,30 $ / 2,50 $ pro 1 Mio. Tokens',
  "Google's current everyday model, and the backup for Claude Sonnet and Opus. Handles photo and multi-page extraction reliably.":
    'Das aktuelle Alltagsmodell von Google und die Reserve für Claude Sonnet und Opus. Liest Fotos und mehrseitige Vorlagen zuverlässig.',
  '~$1.50 / $7.50 per 1M tokens': 'ca. 1,50 $ / 7,50 $ pro 1 Mio. Tokens',
  "Google's strongest reasoning model, for messy handwriting and awkward scans. Google gives this model no free allowance at all, so it returns a quota error unless billing is enabled on the API key.":
    'Das stärkste Reasoning-Modell von Google, für unleserliche Handschrift und schwierige Scans. Google gibt diesem Modell kein kostenloses Kontingent, daher meldet es einen Kontingentfehler, solange für den API-Schlüssel keine Abrechnung aktiviert ist.',
  '~$2.00 / $10.00 per 1M tokens, rising to ~$4.00 / $20.00 after 30 Nov 2026':
    'ca. 2,00 $ / 10,00 $ pro 1 Mio. Tokens, nach dem 30.11.2026 ca. 4,00 $ / 20,00 $',

  // ── AI tasks (AI_TASKS) ────────────────────────────────────────────────────
  'Recipe extraction': 'Rezept einlesen',
  'Reading a recipe off a web page, a PDF, a screenshot or pasted text. The text is already digital and clean, so Sonnet reads it reliably and quickly.':
    'Ein Rezept von einer Webseite, aus einem PDF, einem Screenshot oder eingefügtem Text lesen. Der Text ist schon digital und sauber, deshalb liest Sonnet ihn zuverlässig und schnell.',
  'Photographed pages': 'Fotografierte Seiten',
  'Reading photos taken with a camera: cookbook pages, handwritten cards, a recipe on the fridge. The hardest reading job here (curved pages, bad light, handwriting), so it runs on Opus. A screenshot is not a photo and counts as recipe extraction.':
    'Mit der Kamera aufgenommene Fotos lesen: Kochbuchseiten, handgeschriebene Karten, ein Rezept am Kühlschrank. Die schwierigste Leseaufgabe hier (gewölbte Seiten, schlechtes Licht, Handschrift), deshalb läuft sie auf Opus. Ein Screenshot ist kein Foto und zählt zu „Rezept einlesen“.',
  'Rewriting a recipe in another language. Wrong quantities or mistranslated techniques are hard to notice, so this is worth a stronger model.':
    'Ein Rezept in eine andere Sprache übertragen. Falsche Mengen oder falsch übersetzte Techniken fallen kaum auf, deshalb lohnt sich hier ein stärkeres Modell.',
  'Recipe suggestions': 'Rezeptvorschläge',
  'Picking recipes that match the ingredients you have. Most of the work is done by the embedding search; the model only ranks the shortlist.':
    'Rezepte auswählen, die zu deinen vorhandenen Zutaten passen. Die meiste Arbeit erledigt die Embedding-Suche; das Modell sortiert nur die engere Auswahl.',
  'Tagging': 'Tags vergeben',
  'Assigning tags to a recipe whose text is already available. Short, structured, and forgiving of a cheaper model.':
    'Tags für ein Rezept vergeben, dessen Text schon vorliegt. Kurz, strukturiert und auch mit einem günstigeren Modell gut machbar.',
  'Nutrition estimates': 'Nährwerte schätzen',
  'Estimating calories and macros from the ingredient list. An approximation either way, but quantities and portion sizes need some judgement, so it runs on Sonnet.':
    'Kalorien und Makronährstoffe aus der Zutatenliste schätzen. So oder so eine Näherung, aber Mengen und Portionsgrößen brauchen etwas Urteilsvermögen, deshalb läuft es auf Sonnet.',
  'Recipe scaling': 'Rezept umrechnen',
  'Adjusting quantities for a different number of servings. Mostly arithmetic with unit conversions.':
    'Mengen an eine andere Portionenzahl anpassen. Vor allem Rechnen mit Einheitenumrechnung.',
  'Merging the meal plan into one list and grouping it by aisle. Repetitive and well within a cheap model.':
    'Den Plan zu einer Liste zusammenführen und nach Abteilungen ordnen. Routinearbeit, die ein günstiges Modell gut schafft.',

  // ── Toasts and errors from the store (recipeStore.ts) ──────────────────────
  'Auto-tagging took too long — you can edit tags manually.': 'Das automatische Taggen hat zu lange gedauert – du kannst die Tags von Hand bearbeiten.',
  'That recipe belongs to someone else, so the change was not saved.': 'Dieses Rezept gehört jemand anderem, deshalb wurde die Änderung nicht gespeichert.',
  'Building your shopping list with AI...': 'Deine Einkaufsliste wird mit KI erstellt…',
  'No meals planned for the next 7 days!': 'Für die nächsten 7 Tage ist nichts geplant!',
  'Shopping list generated!': 'Einkaufsliste erstellt!',
  'Shopping list generated. Your own item was kept.': 'Einkaufsliste erstellt. Dein eigener Eintrag ist geblieben.',
  'Shopping list generated. Your own {n} items were kept.': 'Einkaufsliste erstellt. Deine {n} eigenen Einträge sind geblieben.',
  'Failed to generate list': 'Die Liste konnte nicht erstellt werden',
  'Failed to add the item.': 'Der Eintrag konnte nicht hinzugefügt werden.',
  'Failed to update shopping item.': 'Der Eintrag konnte nicht geändert werden.',
  'Failed to delete shopping item.': 'Der Eintrag konnte nicht gelöscht werden.',
  'Failed to clear shopping list.': 'Die Einkaufsliste konnte nicht geleert werden.',
  'Failed to add to pantry.': 'Konnte nicht zum Vorrat hinzugefügt werden.',
  'Added to pantry, but failed to remove from shopping list.': 'Zum Vorrat hinzugefügt, aber nicht von der Einkaufsliste entfernt.',
  'Failed to move to shopping list.': 'Konnte nicht auf die Einkaufsliste verschoben werden.',
  'Added to shopping list, but failed to remove from pantry.': 'Zur Einkaufsliste hinzugefügt, aber nicht aus dem Vorrat entfernt.',
  'Failed to delete pantry item.': 'Der Vorratseintrag konnte nicht gelöscht werden.',
};

export default vault;
