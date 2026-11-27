/**
 * German for messages the server writes in English (api/, shared/) and the
 * app shows through translateMessage() (../index.ts): errors in API answers,
 * stored import failures, the admin System tab's labels and details.
 *
 * The English is copied character for character; a key with {placeholders} is
 * matched as a pattern, in the order written here, so the more specific of two
 * similar keys comes first. A new or reworded message on the server needs its
 * entry here, or it is shown in English.
 */
const server: Record<string, string> = {

  // Every endpoint
  'Unauthorized': 'Nicht angemeldet',
  'Forbidden': 'Kein Zugriff',
  'Method not allowed': 'Methode nicht erlaubt',
  'Request failed.': 'Anfrage fehlgeschlagen.',
  'Invalid request': 'Ungültige Anfrage',
  'Invalid tab': 'Unbekannter Tab',
  'GEMINI_API_KEY is not configured.': 'GEMINI_API_KEY ist nicht konfiguriert.',
  'GEMINI_API_KEY not configured.': 'GEMINI_API_KEY ist nicht konfiguriert.',

  // The daily allowance
  'Daily AI call limit reached ({limit} calls/day). Resets at midnight UTC.':
    'Das KI-Kontingent für heute ist aufgebraucht ({limit} Aufrufe pro Tag). Um Mitternacht (UTC) geht es weiter.',
  'Daily image lookup limit reached ({limit}/day). Resets at midnight UTC.':
    'Das Tageslimit für die Bildsuche ist erreicht ({limit} pro Tag). Um Mitternacht (UTC) geht es weiter.',
  'Your daily AI allowance could not be checked just now. Please try again in a minute.':
    'Dein KI-Kontingent für heute konnte gerade nicht geprüft werden. Bitte versuche es in einer Minute noch einmal.',

  // describeGeminiError() and each endpoint's fallback
  'The AI service is not available right now because of a configuration problem on our side. Nothing is wrong with your recipe — please try again later.':
    'Der KI-Dienst ist gerade nicht verfügbar, weil bei uns etwas falsch konfiguriert ist. Mit deinem Rezept ist alles in Ordnung – bitte versuche es später noch einmal.',
  'The AI service has hit its usage limit for now. Please try again later.':
    'Der KI-Dienst hat sein Nutzungslimit vorerst erreicht. Bitte versuche es später noch einmal.',
  'The AI service is busy. This usually clears in a minute — please try again.':
    'Der KI-Dienst ist ausgelastet. Das legt sich meist nach einer Minute – bitte versuche es noch einmal.',
  'The configured AI model is unavailable. This is a configuration problem on our side.':
    'Das eingestellte KI-Modell ist nicht verfügbar. Das ist ein Konfigurationsproblem auf unserer Seite.',
  'Failed to extract recipe': 'Das Rezept konnte nicht ausgelesen werden',
  'Failed to tag recipe': 'Die Tags konnten nicht erstellt werden',
  'Failed to estimate nutrition': 'Die Nährwerte konnten nicht geschätzt werden',
  'Failed to translate recipe': 'Das Rezept konnte nicht übersetzt werden',
  'Failed to scale recipe': 'Das Rezept konnte nicht skaliert werden',
  'Failed to suggest recipes': 'Es konnten keine Rezepte vorgeschlagen werden',
  'Failed to generate shopping list': 'Die Einkaufsliste konnte nicht erstellt werden',
  'The AI returned an empty response.': 'Die KI hat eine leere Antwort geliefert.',
  'The AI returned no supported tags.': 'Die KI hat keine passenden Tags geliefert.',
  'Cached tags did not contain any supported tags.':
    'Die gespeicherten Tags enthielten keine passenden Tags.',
  'Invalid AI tag output: {reason}': 'Die KI hat unbrauchbare Tags geliefert: {reason}',
  'Invalid AI nutrition output: {reason}': 'Die KI hat unbrauchbare Nährwerte geliefert: {reason}',
  'Invalid AI scale output: {reason}':
    'Die KI hat ein unbrauchbares Ergebnis beim Skalieren geliefert: {reason}',
  'Invalid AI suggest output: {reason}': 'Die KI hat unbrauchbare Vorschläge geliefert: {reason}',
  'Invalid AI shopping output: {reason}':
    'Die KI hat eine unbrauchbare Einkaufsliste geliefert: {reason}',
  'Claude declined to answer this request.': 'Claude hat die Antwort auf diese Anfrage abgelehnt.',
  'Claude ran out of room before finishing the answer.':
    'Claude ist der Platz ausgegangen, bevor die Antwort fertig war.',

  // Reading a recipe from a link, a page or pasted text
  '{site} does not let apps read its pages, so this recipe cannot be imported from the link.':
    '{site} lässt Apps seine Seiten nicht lesen, deshalb lässt sich dieses Rezept nicht über den Link importieren.',
  'That page does not exist on {site} (any more). Check the link.':
    'Diese Seite gibt es auf {site} nicht (mehr). Prüfe den Link.',
  '{site} did not send the page (error {status}). Try again later, or paste the recipe as text.':
    '{site} hat die Seite nicht geschickt (Fehler {status}). Versuche es später noch einmal oder füge das Rezept als Text ein.',
  '{site} did not answer in time. Try again later, or paste the recipe as text.':
    '{site} hat nicht rechtzeitig geantwortet. Versuche es später noch einmal oder füge das Rezept als Text ein.',
  'Instagram did not show this post to Speisekammer: it may be private, or Instagram asked for a login.':
    'Instagram hat Speisekammer diesen Beitrag nicht gezeigt: Vielleicht ist er privat, oder Instagram hat eine Anmeldung verlangt.',
  "No recipe was found in this post's caption. If it is only in the video, it cannot be read from the link.":
    'In der Bildunterschrift dieses Beitrags wurde kein Rezept gefunden. Steht es nur im Video, lässt es sich über den Link nicht lesen.',
  'No recipe was found on this page.': 'Auf dieser Seite wurde kein Rezept gefunden.',
  'No recipe was found in that text. Paste the ingredients and the steps, then try again.':
    'In diesem Text wurde kein Rezept gefunden. Füge die Zutaten und die Schritte ein und versuche es noch einmal.',
  'Only http and https URLs can be imported.':
    'Nur Links mit http oder https lassen sich importieren.',
  'URLs with credentials cannot be imported.':
    'Links mit Zugangsdaten lassen sich nicht importieren.',
  'Local URLs cannot be imported.': 'Lokale Adressen lassen sich nicht importieren.',
  'Private or local network URLs cannot be imported.':
    'Adressen in privaten oder lokalen Netzwerken lassen sich nicht importieren.',
  'Too many redirects while fetching the URL.': 'Zu viele Weiterleitungen beim Abrufen des Links.',

  // Request checks (api/_lib/schemas.ts)
  'A valid URL is required': 'Bitte gib einen gültigen Link an',
  'recipeId must be a UUID': 'recipeId muss eine UUID sein',
  'title is required': 'Ein Titel wird gebraucht',
  'At least one ingredient is required': 'Mindestens eine Zutat wird gebraucht',
  'At most 50 ingredients at once': 'Höchstens 50 Zutaten auf einmal',
  'That ingredient list is too long.': 'Diese Zutatenliste ist zu lang.',
  'That shopping list is too long': 'Diese Einkaufsliste ist zu lang',
  'image data is required': 'Es fehlen die Bilddaten',
  'At least one image is required': 'Mindestens ein Bild wird gebraucht',
  'At most {max} images can be extracted at once':
    'Höchstens {max} Bilder lassen sich auf einmal auslesen',
  'Paste the whole recipe — the ingredients and the steps.':
    'Füge das ganze Rezept ein – die Zutaten und die Schritte.',
  'That is too long to read in one go (the limit is {limit} characters). Paste just the recipe.':
    'Das ist zu lang, um es in einem Durchgang zu lesen (die Grenze liegt bei {limit} Zeichen). Füge nur das Rezept ein.',
  'Unsupported language': 'Diese Sprache wird nicht unterstützt',

  // Translating (api/translate.ts, translationGuard.ts)
  'Recipe not found.': 'Rezept nicht gefunden.',
  'This recipe needs a title, ingredients and steps before it can be translated.':
    'Dieses Rezept braucht einen Titel, Zutaten und Schritte, bevor es übersetzt werden kann.',
  'The translation came back garbled (the title contains a code fence), so it was not saved. Please try again.':
    'Die Übersetzung kam beschädigt zurück (der Titel enthält einen Code-Block), deshalb wurde sie nicht gespeichert. Bitte versuche es noch einmal.',
  'The translation came back garbled (the description contains a code fence), so it was not saved. Please try again.':
    'Die Übersetzung kam beschädigt zurück (die Beschreibung enthält einen Code-Block), deshalb wurde sie nicht gespeichert. Bitte versuche es noch einmal.',
  'The translation came back garbled (the instructions contains a code fence), so it was not saved. Please try again.':
    'Die Übersetzung kam beschädigt zurück (die Zubereitung enthält einen Code-Block), deshalb wurde sie nicht gespeichert. Bitte versuche es noch einmal.',
  'The translation came back garbled (an ingredient contains a code fence), so it was not saved. Please try again.':
    'Die Übersetzung kam beschädigt zurück (eine Zutat enthält einen Code-Block), deshalb wurde sie nicht gespeichert. Bitte versuche es noch einmal.',
  'The translation came back garbled (the title runs over several lines), so it was not saved. Please try again.':
    'Die Übersetzung kam beschädigt zurück (der Titel läuft über mehrere Zeilen), deshalb wurde sie nicht gespeichert. Bitte versuche es noch einmal.',
  'The translation came back garbled (the title is far longer than the original), so it was not saved. Please try again.':
    'Die Übersetzung kam beschädigt zurück (der Titel ist viel länger als das Original), deshalb wurde sie nicht gespeichert. Bitte versuche es noch einmal.',
  'The translation came back garbled (the instructions are far longer than the original), so it was not saved. Please try again.':
    'Die Übersetzung kam beschädigt zurück (die Zubereitung ist viel länger als das Original), deshalb wurde sie nicht gespeichert. Bitte versuche es noch einmal.',
  'The translation came back garbled (the instructions are cut short), so it was not saved. Please try again.':
    'Die Übersetzung kam beschädigt zurück (die Zubereitung bricht vorzeitig ab), deshalb wurde sie nicht gespeichert. Bitte versuche es noch einmal.',
  'The translation came back garbled (it has {got} ingredients where the recipe has {expected}), so it was not saved. Please try again.':
    'Die Übersetzung kam beschädigt zurück (sie hat {got} Zutaten, das Rezept hat {expected}), deshalb wurde sie nicht gespeichert. Bitte versuche es noch einmal.',
  'The translation came back garbled (it has {got} step where the recipe has {expected}), so it was not saved. Please try again.':
    'Die Übersetzung kam beschädigt zurück (sie hat {got} Schritt, das Rezept hat {expected}), deshalb wurde sie nicht gespeichert. Bitte versuche es noch einmal.',
  'The translation came back garbled (it has {got} steps where the recipe has {expected}), so it was not saved. Please try again.':
    'Die Übersetzung kam beschädigt zurück (sie hat {got} Schritte, das Rezept hat {expected}), deshalb wurde sie nicht gespeichert. Bitte versuche es noch einmal.',
  'The translation came back garbled ({fault}), so it was not saved. Please try again.':
    'Die Übersetzung kam beschädigt zurück ({fault}), deshalb wurde sie nicht gespeichert. Bitte versuche es noch einmal.',

  // Sending a recipe (api/share.ts)
  'Your account needs an email address to share recipes.':
    'Dein Konto braucht eine E-Mail-Adresse, um Rezepte zu senden.',
  'You cannot send a recipe to yourself.': 'Du kannst dir nicht selbst ein Rezept senden.',
  'You do not own this recipe.': 'Dieses Rezept gehört dir nicht.',
  'You can send up to {limit} recipes a day. Try again tomorrow.':
    'Du kannst bis zu {limit} Rezepte am Tag senden. Versuche es morgen wieder.',
  'You already sent this recipe to that address — it is still pending.':
    'Du hast dieses Rezept schon an diese Adresse gesendet – es wartet dort noch.',
  'Confirm your email address before accepting recipes sent to it.':
    'Bestätige deine E-Mail-Adresse, bevor du Rezepte annimmst, die an sie gesendet wurden.',
  'Share not found or already processed.':
    'Dieses gesendete Rezept wurde nicht gefunden oder ist schon erledigt.',
  'The original recipe no longer exists.': 'Das ursprüngliche Rezept gibt es nicht mehr.',
  'Failed to process share request.': 'Die Anfrage konnte nicht verarbeitet werden.',

  // Imports from the iPhone, as stored in recipe_imports
  'No recipe could be read from this picture.': 'Aus diesem Bild ließ sich kein Rezept lesen.',
  "Today's AI allowance is used up. Send it again tomorrow.":
    'Das KI-Kontingent für heute ist aufgebraucht. Schick es morgen noch einmal.',
  'The picture could not be read just now. Please send it again later.':
    'Das Bild konnte gerade nicht gelesen werden. Bitte schick es später noch einmal.',
  'The page could not be read just now. Please send it again later.':
    'Die Seite konnte gerade nicht gelesen werden. Bitte schick sie später noch einmal.',
  'The picture could not be stored: {reason}':
    'Das Bild konnte nicht gespeichert werden: {reason}',
  'The recipe could not be saved.': 'Das Rezept konnte nicht gespeichert werden.',

  // The account endpoint (admin dashboard, Settings)
  'Recipe not found': 'Rezept nicht gefunden',
  'Report not found': 'Meldung nicht gefunden',
  'Invalid feedback status': 'Ungültiger Status',
  'No editable fields supplied': 'Keine änderbaren Felder übergeben',
  'Invalid model configuration': 'Ungültige Modellkonfiguration',
  'Not a model this app offers': 'Dieses Modell bietet die App nicht an',
  'Invalid link': 'Ungültiger Link',
  'Paste the iCloud link from the Shortcuts app (it starts with https://www.icloud.com/shortcuts/).':
    'Füge den iCloud-Link aus der Kurzbefehle-App ein (er beginnt mit https://www.icloud.com/shortcuts/).',
  'The usage report needs the latest database migration. Try again in a few minutes.':
    'Der Nutzungsbericht braucht die neueste Datenbank-Migration. Versuche es in ein paar Minuten noch einmal.',
  'The check ran less than a minute ago. Please wait a moment before running it again.':
    'Die Prüfung lief vor weniger als einer Minute. Bitte warte kurz, bevor du sie erneut startest.',

  // System check: configuration (api/_lib/systemCheck.ts)
  'Supabase URL': 'Supabase-URL',
  'Supabase public key': 'Öffentlicher Supabase-Schlüssel',
  'Supabase service key': 'Supabase-Service-Schlüssel',
  'Claude API key': 'Claude-API-Schlüssel',
  'Gemini API key': 'Gemini-API-Schlüssel',
  'Unsplash key': 'Unsplash-Schlüssel',
  'Sentry, server': 'Sentry, Server',
  'Sentry, browser': 'Sentry, Browser',
  'Sentry, source maps': 'Sentry, Source Maps',
  'Allowed origin (CORS)': 'Erlaubte Herkunft (CORS)',
  'Set ({name}).': 'Gesetzt ({name}).',
  '{names} is not set. Nothing can reach the database.':
    '{names} ist nicht gesetzt. Nichts erreicht die Datenbank.',
  '{names} is not set. The app cannot sign anyone in.':
    '{names} ist nicht gesetzt. Die App kann niemanden anmelden.',
  '{names} is not set. The server functions refuse to run.':
    '{names} ist nicht gesetzt. Die Server-Funktionen verweigern den Dienst.',
  '{names} is not set. Claude is the main AI provider. Without its key every task runs on Gemini, the backup, and Claude models show as skipped below.':
    '{names} ist nicht gesetzt. Claude ist der wichtigste KI-Anbieter. Ohne seinen Schlüssel läuft jede Aufgabe auf Gemini, dem Ersatz, und die Claude-Modelle werden unten als übersprungen angezeigt.',
  '{names} is not set. Recipe search and the backup for every task stop working, and every task on a Gemini model fails.':
    '{names} ist nicht gesetzt. Die Rezeptsuche und der Ersatz für jede Aufgabe fallen aus, und jede Aufgabe auf einem Gemini-Modell schlägt fehl.',
  '{names} is not set. Nobody can open this panel.':
    '{names} ist nicht gesetzt. Niemand kann diesen Bereich öffnen.',
  '{names} is not set. Image search is off.': '{names} ist nicht gesetzt. Die Bildsuche ist aus.',
  '{names} is not set. Errors in the server functions are not reported anywhere.':
    '{names} ist nicht gesetzt. Fehler in den Server-Funktionen werden nirgends gemeldet.',
  '{names} is not set. Errors in the app itself are not reported anywhere.':
    '{names} ist nicht gesetzt. Fehler in der App selbst werden nirgends gemeldet.',
  '{names} is not set. Errors from the app arrive, but their stack traces show minified code.':
    '{names} ist nicht gesetzt. Fehler aus der App kommen an, aber ihre Stack-Traces zeigen minifizierten Code.',
  '{names} is not set. Any website may call the API. Sign-in still protects it, because the token travels in a header rather than a cookie.':
    '{names} ist nicht gesetzt. Jede Website darf die API aufrufen. Die Anmeldung schützt sie trotzdem, weil das Token in einem Header reist und nicht in einem Cookie.',

  // System check: services
  'Database schema': 'Datenbankschema',
  'Realtime': 'Realtime',
  'Database': 'Datenbank',
  'Sign-in (Supabase Auth)': 'Anmeldung (Supabase Auth)',
  'Photo storage': 'Fotospeicher',
  'Image search (Unsplash)': 'Bildsuche (Unsplash)',
  'system_health() could not be called ({reason}). Migration {version} has probably not been applied: check the "Production Database Migration" job.':
    'system_health() konnte nicht aufgerufen werden ({reason}). Migration {version} wurde vermutlich nicht angewendet: Prüfe den Job „Production Database Migration“.',
  'The list of applied migrations cannot be read, so whether {version} is applied is unknown.':
    'Die Liste der angewendeten Migrationen lässt sich nicht lesen, deshalb ist unklar, ob {version} angewendet ist.',
  'The list of applied migrations cannot be read, so whether {version} is applied is unknown. {versions}':
    'Die Liste der angewendeten Migrationen lässt sich nicht lesen, deshalb ist unklar, ob {version} angewendet ist. {versions}',
  'At migration {latest}, but this code expects {expected}. A migration has not been applied: check the "Production Database Migration" job.':
    'Stand: Migration {latest}, dieser Code erwartet aber {expected}. Eine Migration wurde nicht angewendet: Prüfe den Job „Production Database Migration“.',
  'At migration {latest}, but this code expects {expected}. A migration has not been applied: check the "Production Database Migration" job. {versions}':
    'Stand: Migration {latest}, dieser Code erwartet aber {expected}. Eine Migration wurde nicht angewendet: Prüfe den Job „Production Database Migration“. {versions}',
  'At migration {latest}, newer than this code expects ({expected}) — normal while a deploy is under way.':
    'Stand: Migration {latest}, neuer als dieser Code erwartet ({expected}) – normal, solange ein Deploy läuft.',
  'At migration {latest}, newer than this code expects ({expected}) — normal while a deploy is under way. {versions}':
    'Stand: Migration {latest}, neuer als dieser Code erwartet ({expected}) – normal, solange ein Deploy läuft. {versions}',
  'At migration {latest}, as this code expects.':
    'Stand: Migration {latest}, wie dieser Code es erwartet.',
  'At migration {latest}, as this code expects. {versions}':
    'Stand: Migration {latest}, wie dieser Code es erwartet. {versions}',
  'Unknown: the database could not be asked.':
    'Unbekannt: Die Datenbank konnte nicht gefragt werden.',
  'recipes is published, so a new card updates as soon as its tags and nutrition are saved.':
    'recipes ist veröffentlicht, eine neue Karte aktualisiert sich also, sobald ihre Tags und Nährwerte gespeichert sind.',
  'recipes is not in the Realtime publication (migration 0059). New cards still finish, through the 5-second poll.':
    'recipes fehlt in der Realtime-Publikation (Migration 0059). Neue Karten werden trotzdem fertig, über die Abfrage alle 5 Sekunden.',
  'Not reachable: {reason}': 'Nicht erreichbar: {reason}',
  'Reachable.': 'Erreichbar.',
  'Reachable. {count} recipes.': 'Erreichbar. {count} Rezepte.',
  'Reachable. {count} accounts.': 'Erreichbar. {count} Konten.',
  'Reachable. {remaining} of {limit} requests left this hour.':
    'Erreichbar. Noch {remaining} von {limit} Anfragen in dieser Stunde.',
  'The recipe-images bucket cannot be read: {reason}':
    'Der Bucket recipe-images lässt sich nicht lesen: {reason}',
  'recipe-images exists, public, up to {size} MB a file.':
    'recipe-images existiert, öffentlich, bis zu {size} MB pro Datei.',
  'recipe-images exists, private, up to {size} MB a file.':
    'recipe-images existiert, privat, bis zu {size} MB pro Datei.',
  'recipe-images exists, public.': 'recipe-images existiert, öffentlich.',
  'recipe-images exists, private.': 'recipe-images existiert, privat.',
  'No key is set, so image search is off.':
    'Es ist kein Schlüssel gesetzt, die Bildsuche ist also aus.',
  'Unsplash refused the key (401).': 'Unsplash hat den Schlüssel abgelehnt (401).',
  'The hourly limit is used up (403). Image search resumes when the hour turns.':
    'Das Stundenlimit ist aufgebraucht (403). Die Bildsuche geht zur vollen Stunde weiter.',
  'Unexpected answer: HTTP {status}.': 'Unerwartete Antwort: HTTP {status}.',

  // System check: the model probes
  'No answer within {seconds} seconds.': 'Keine Antwort innerhalb von {seconds} Sekunden.',
  'The Claude key was refused ({code}). Every task on this model fails. Tasks on this model run on Gemini instead. Anthropic said: {said}':
    'Der Claude-Schlüssel wurde abgelehnt ({code}). Jede Aufgabe auf diesem Modell schlägt fehl. Aufgaben auf diesem Modell laufen stattdessen auf Gemini. Anthropic meldete: {said}',
  'The key or the Google Cloud project was refused ({code}). Every task on this model fails. Google said: {said}':
    'Der Schlüssel oder das Google-Cloud-Projekt wurde abgelehnt ({code}). Jede Aufgabe auf diesem Modell schlägt fehl. Google meldete: {said}',
  "The Claude account is out of credit (402). Tasks on this model run on Gemini instead. The plan's monthly credit refreshes each billing cycle. Anthropic said: {said}":
    'Das Guthaben des Claude-Kontos ist aufgebraucht (402). Aufgaben auf diesem Modell laufen stattdessen auf Gemini. Das Monatsguthaben des Tarifs wird mit jedem Abrechnungszeitraum erneuert. Anthropic meldete: {said}',
  "The Claude account is out of credit (402). The plan's monthly credit refreshes each billing cycle. Anthropic said: {said}":
    'Das Guthaben des Claude-Kontos ist aufgebraucht (402). Das Monatsguthaben des Tarifs wird mit jedem Abrechnungszeitraum erneuert. Anthropic meldete: {said}',
  'Anthropic does not serve this model id (404): retired or misspelt. Tasks on this model run on Gemini instead. Anthropic said: {said}':
    'Anthropic bedient diese Modell-ID nicht (404): eingestellt oder falsch geschrieben. Aufgaben auf diesem Modell laufen stattdessen auf Gemini. Anthropic meldete: {said}',
  'Google does not serve this model id (404): retired or misspelt. Google said: {said}':
    'Google bedient diese Modell-ID nicht (404): eingestellt oder falsch geschrieben. Google meldete: {said}',
  'Rate limit reached (429); this clears within a minute. Tasks on this model run on Gemini instead. Anthropic said: {said}':
    'Ratenlimit erreicht (429); das legt sich innerhalb einer Minute. Aufgaben auf diesem Modell laufen stattdessen auf Gemini. Anthropic meldete: {said}',
  'Quota used up (429). On a free-tier key a model may have no allowance at all and need billing. Google said: {said}':
    'Kontingent aufgebraucht (429). Mit einem Schlüssel der kostenlosen Stufe hat ein Modell womöglich gar kein Kontingent und braucht eine Abrechnung. Google meldete: {said}',
  'Anthropic is overloaded or failing right now ({code}); this usually clears within minutes. Tasks on this model run on Gemini instead. Anthropic said: {said}':
    'Anthropic ist gerade überlastet oder gestört ({code}); das legt sich meist innerhalb von Minuten. Aufgaben auf diesem Modell laufen stattdessen auf Gemini. Anthropic meldete: {said}',
  'Google is overloaded or failing right now ({code}); this usually clears within minutes. Google said: {said}':
    'Google ist gerade überlastet oder gestört ({code}); das legt sich meist innerhalb von Minuten. Google meldete: {said}',
  'The request failed ({code}): Tasks on this model run on Gemini instead. {said}':
    'Die Anfrage ist fehlgeschlagen ({code}): Aufgaben auf diesem Modell laufen stattdessen auf Gemini. {said}',
  'The request failed: Tasks on this model run on Gemini instead. {said}':
    'Die Anfrage ist fehlgeschlagen: Aufgaben auf diesem Modell laufen stattdessen auf Gemini. {said}',
  'The request failed ({code}): {said}': 'Die Anfrage ist fehlgeschlagen ({code}): {said}',
  'The request failed: {said}': 'Die Anfrage ist fehlgeschlagen: {said}',
  'No Claude key is set (ANTHROPIC_API_KEY). Tasks on this model run on Gemini instead.':
    'Es ist kein Claude-Schlüssel gesetzt (ANTHROPIC_API_KEY). Aufgaben auf diesem Modell laufen stattdessen auf Gemini.',
  'No Gemini key is set.': 'Es ist kein Gemini-Schlüssel gesetzt.',
  'Answered, but not in the recipe format asked for: {text}':
    'Hat geantwortet, aber nicht im verlangten Rezeptformat: {text}',
  'Answered, but not with the JSON asked for: {text}':
    'Hat geantwortet, aber nicht mit dem verlangten JSON: {text}',
  "Answers in the app's recipe format, at low effort, which is how tasks that skip reasoning run on Claude.":
    'Antwortet im Rezeptformat der App, mit niedrigem Aufwand – so laufen Aufgaben ohne Reasoning auf Claude.',
  'Answers, and accepts reasoning switched off.':
    'Antwortet und akzeptiert abgeschaltetes Reasoning.',
  'Answers, and accepts reasoning switched off. Refused: {settings}.':
    'Antwortet und akzeptiert abgeschaltetes Reasoning. Abgelehnt: {settings}.',
  'Answers at the lowest reasoning level, minimal. From Gemini 3 on, reasoning can be lowered but not switched off.':
    'Antwortet auf der niedrigsten Reasoning-Stufe, minimal. Ab Gemini 3 lässt sich Reasoning senken, aber nicht abschalten.',
  'Answers at the lowest reasoning level, minimal. From Gemini 3 on, reasoning can be lowered but not switched off. Refused: {settings}.':
    'Antwortet auf der niedrigsten Reasoning-Stufe, minimal. Ab Gemini 3 lässt sich Reasoning senken, aber nicht abschalten. Abgelehnt: {settings}.',
  'Answers. The lowest reasoning level this model offers is low.':
    'Antwortet. Die niedrigste Reasoning-Stufe dieses Modells ist „low“.',
  'Answers. The lowest reasoning level this model offers is low. Refused: {settings}.':
    'Antwortet. Die niedrigste Reasoning-Stufe dieses Modells ist „low“. Abgelehnt: {settings}.',
  'Answers, but refused every lower reasoning setting: tasks meant to run without reasoning run at its default on this model.':
    'Antwortet, hat aber jede niedrigere Reasoning-Einstellung abgelehnt: Aufgaben, die ohne Reasoning laufen sollen, laufen auf diesem Modell mit dessen Standard.',
  'Answers, but refused every lower reasoning setting: tasks meant to run without reasoning run at its default on this model. Refused: {settings}.':
    'Antwortet, hat aber jede niedrigere Reasoning-Einstellung abgelehnt: Aufgaben, die ohne Reasoning laufen sollen, laufen auf diesem Modell mit dessen Standard. Abgelehnt: {settings}.',
  'Answers.': 'Antwortet.',
  'Answers. Refused: {settings}.': 'Antwortet. Abgelehnt: {settings}.',
  'Answered with {count} values instead of 768, which recipes.embedding cannot store.':
    'Hat mit {count} Werten statt 768 geantwortet, was recipes.embedding nicht speichern kann.',
  'Answers with 768 values, as recipe search needs.':
    'Antwortet mit 768 Werten, wie die Rezeptsuche sie braucht.',
};

export default server;
