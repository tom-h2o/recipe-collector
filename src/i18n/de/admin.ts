/**
 * German for the admin dashboard (AdminPanel, AdminRecipeView, AdminUsage,
 * AdminFeedback, SystemCheck) and the release notes shown in "What's new".
 *
 * A key with a placeholder also works as a pattern for server messages
 * (translateMessage in ../index.ts), so short generic ones carry a ## note,
 * which no server text contains.
 */
const admin: Record<string, string> = {

  // Shared by the admin tabs
  'Request failed ({status})': 'Anfrage fehlgeschlagen ({status})',
  'Retry': 'Erneut versuchen',
  'Status': 'Status',
  'Model': 'Modell',
  'Reasoning': 'Reasoning',
  'AI calls': 'KI-Aufrufe',
  'Previous page': 'Vorherige Seite',
  'Next page': 'Nächste Seite',

  // AdminPanel
  '{from}–{to} of {total}': '{from}–{to} von {total}',
  'Failed to load admin stats': 'Admin-Statistiken konnten nicht geladen werden',
  'Failed to load users': 'Nutzer konnten nicht geladen werden',
  'Failed to load recipes': 'Rezepte konnten nicht geladen werden',
  'Failed to load logs': 'Das KI-Protokoll konnte nicht geladen werden',
  'Failed to load recipe': 'Rezept konnte nicht geladen werden',
  'Failed to delete user': 'Nutzer konnte nicht gelöscht werden',
  'Deleted {email}': '{email} gelöscht',
  'Regenerating tags…': 'Tags werden neu erstellt…',
  'Regenerating nutrition…': 'Nährwerte werden neu berechnet…',
  'Tags regenerated': 'Tags neu erstellt',
  'Nutrition regenerated': 'Nährwerte neu berechnet',
  'Failed to re-run tag': 'Tags konnten nicht neu erstellt werden',
  'Failed to re-run nutrition': 'Nährwerte konnten nicht neu berechnet werden',
  'Loading admin data…': 'Admin-Daten werden geladen…',
  'Admin data unavailable': 'Admin-Daten nicht verfügbar',
  'The dashboard could not be loaded.': 'Das Dashboard konnte nicht geladen werden.',
  'Overview': 'Übersicht',
  'Usage': 'Nutzung',
  'Feedback': 'Feedback',
  'Users': 'Nutzer',
  'AI Logs': 'KI-Protokoll',
  'System': 'System',
  'Admin Dashboard': 'Admin-Dashboard',
  'Refresh': 'Aktualisieren',
  'Admin sections': 'Admin-Bereiche',
  'Total users': 'Nutzer gesamt',
  'Total recipes': 'Rezepte gesamt',
  'AI calls total': 'KI-Aufrufe gesamt',
  'AI calls today': 'KI-Aufrufe heute',
  'AI calls this week': 'KI-Aufrufe diese Woche',
  'Model usage': 'Modellnutzung',
  'Joined': 'Beigetreten',
  'Last seen': 'Zuletzt gesehen',
  'Delete user': 'Nutzer löschen',
  "Search everyone's recipes by title…": 'Alle Rezepte nach Titel durchsuchen…',
  'Search recipes by title': 'Rezepte nach Titel durchsuchen',
  'Clear search': 'Suche leeren',
  "Show everyone's recipes": 'Rezepte aller anzeigen',
  'No recipes match.': 'Keine passenden Rezepte.',
  'No recipes yet.': 'Noch keine Rezepte.',
  'Favourite##marked': 'Favorit',
  'No account': 'Kein Konto',
  'Time': 'Zeit',
  'User': 'Nutzer',
  'Endpoint': 'Endpunkt',
  'Latency': 'Latenz',
  '{model} resolved to {version}': '{model} lief als {version}',
  'success##log status': 'Erfolg',
  'error##log status': 'Fehler',
  'Delete user?': 'Nutzer löschen?',
  'This will permanently delete <b>{email}</b> and all their recipes, meal plans, and settings.':
    '<b>{email}</b> wird endgültig gelöscht – mit allen Rezepten, Wochenplänen und Einstellungen.',
  'Deleting…': 'Löscht…',

  // AdminRecipeView
  'Close recipe': 'Rezept schließen',
  'Belongs to <b>{email}</b>': 'Gehört <b>{email}</b>',
  'Belongs to no account': 'Gehört zu keinem Konto',
  'added {date}': 'hinzugefügt am {date}',
  'Regenerating…': 'Wird neu erstellt…',
  'Regenerate tags': 'Tags neu erstellen',
  'Regenerate nutrition': 'Nährwerte neu berechnen',
  '{n} serving': '{n} Portion',
  '{n} servings': '{n} Portionen',
  '{n} ingredients##one': '{n} Zutat',
  '{n} ingredients': '{n} Zutaten',
  'No tags yet': 'Noch keine Tags',
  'Loading the recipe…': 'Rezept wird geladen…',

  // AdminUsage and usageLabels
  'The usage report could not be loaded.': 'Der Nutzungsbericht konnte nicht geladen werden.',
  'Period': 'Zeitraum',
  'Last {n} days': 'Letzte {n} Tage',
  'Active people': 'Aktive Personen',
  'Recipes added': 'Neue Rezepte',
  'iPhone imports': 'iPhone-Importe',
  'Recipes sent': 'Gesendete Rezepte',
  'Accounts connected': 'Verknüpfte Konten',
  'Since {date}. Active means opened the app or saved something: a recipe, a plan, a list item, a rating, a share.':
    'Seit {date}. Aktiv heißt: die App geöffnet oder etwas gespeichert – ein Rezept, einen Plan, einen Listeneintrag, eine Bewertung, ein geteiltes Rezept.',
  'Opening the app counts from {date}; before that, only saving did.':
    'Das Öffnen der App zählt seit {date}; davor zählte nur das Speichern.',
  'Opening the app will count from the first visit after this release; until then, only saving does.':
    'Das Öffnen der App zählt ab dem ersten Besuch nach diesem Release; bis dahin zählt nur das Speichern.',
  'Active people per week': 'Aktive Personen pro Woche',
  'Recipes added per week': 'Neue Rezepte pro Woche',
  'Week of {day}: {n} person': 'Woche ab {day}: {n} Person',
  'Week of {day}: {n} people': 'Woche ab {day}: {n} Personen',
  'Week of {day}: {n} recipe': 'Woche ab {day}: {n} Rezept',
  'Week of {day}: {n} recipes': 'Woche ab {day}: {n} Rezepte',
  'Weekly numbers as a table': 'Wochenzahlen als Tabelle',
  'Week of': 'Woche ab',
  'Features used': 'Genutzte Funktionen',
  'From the AI log, which keeps 30 days. Cook mode, timers, filters and printing never reach the server and cannot appear here.':
    'Aus dem KI-Protokoll, das 30 Tage zurückreicht. Kochmodus, Timer, Filter und Drucken erreichen den Server nie und können hier nicht auftauchen.',
  'Nothing in this period.': 'Nichts in diesem Zeitraum.',
  '{n} time##usage': '{n}-mal',
  '{n} times##usage': '{n}-mal',
  '{n} person##usage': '{n} Person',
  '{n} people##usage': '{n} Personen',
  '{n} failed##usage': '{n} fehlgeschlagen',
  'From the iPhone': 'Vom iPhone',
  'Recipes sent with the Shortcuts, by what was shared.':
    'Mit den Kurzbefehlen gesendete Rezepte, nach Art des Geteilten.',
  'People': 'Personen',
  'Last active': 'Zuletzt aktiv',
  'Days active': 'Aktive Tage',
  '{added} <dim>of {total}</dim>': '{added} <dim>von {total}</dim>',
  'Days active, recipes added and AI calls are for the period above.':
    'Aktive Tage, neue Rezepte und KI-Aufrufe beziehen sich auf den Zeitraum oben.',
  'Recipe from a link': 'Rezept aus einem Link',
  'Recipe from a photo': 'Rezept aus einem Foto',
  'Recipe from a screenshot': 'Rezept aus einem Screenshot',
  'Recipe from a PDF': 'Rezept aus einem PDF',
  'Recipe from pasted text': 'Rezept aus eingefügtem Text',
  'Safari page (iPhone Shortcut)': 'Safari-Seite (iPhone-Kurzbefehl)',
  'Shared link (iPhone Shortcut)': 'Geteilter Link (iPhone-Kurzbefehl)',
  'Tags, after saving': 'Tags, nach dem Speichern',
  'Nutrition, after saving': 'Nährwerte, nach dem Speichern',
  'Scaling': 'Skalieren',
  'What can I cook?': 'Was kann ich kochen?',
  'Shopping list from the plan': 'Einkaufsliste aus dem Plan',
  'Cover picture search': 'Titelbild-Suche',
  'Photos': 'Fotos',
  'Safari page': 'Safari-Seite',
  'Shared link': 'Geteilter Link',

  // AdminFeedback
  'Bug': 'Fehler',
  'Idea': 'Idee',
  'Other##feedback kind': 'Sonstiges',
  'New##status': 'Neu',
  'Seen##status': 'Gesehen',
  'Done##status': 'Erledigt',
  'The feedback could not be loaded. If this is right after a deploy, the database migration may still be running.':
    'Das Feedback konnte nicht geladen werden. Direkt nach einem Deploy läuft vielleicht noch die Datenbank-Migration.',
  'The status could not be saved. Please try again.':
    'Der Status konnte nicht gespeichert werden. Bitte versuche es noch einmal.',
  'Loading feedback': 'Feedback wird geladen',
  'No feedback yet': 'Noch kein Feedback',
  'Reports sent from the account menu appear here.':
    'Meldungen aus dem Konto-Menü erscheinen hier.',
  'Unknown account': 'Unbekanntes Konto',
  'Context': 'Kontext',
  'Page {page} of {pages}': 'Seite {page} von {pages}',

  // SystemCheck
  'Warning': 'Warnung',
  'Failing': 'Fehlerhaft',
  'Not checked': 'Nicht geprüft',
  '{n} failing##checks': '{n} fehlerhaft',
  '{n} warning##checks': '{n} Warnung',
  '{n} warnings##checks': '{n} Warnungen',
  'All OK': 'Alles OK',
  'Recipe search': 'Rezeptsuche',
  'Chosen by a user': 'Von einem Nutzer gewählt',
  'Not recorded yet': 'Noch nicht erfasst',
  'No calls': 'Keine Aufrufe',
  '{n} off##reasoning': '{n} aus',
  '{n} minimal##reasoning': '{n} minimal',
  '{n} low##reasoning': '{n} niedrig',
  '{n} on##reasoning': '{n} an',
  '{n} before recording': '{n} vor der Erfassung',
  '{n} refused##reasoning': '{n} abgelehnt',
  'Reasoning was meant to be lowered, but this model refused every lower setting':
    'Das Reasoning sollte gesenkt werden, aber dieses Modell hat jede niedrigere Einstellung abgelehnt',
  'Could not load the configuration.': 'Die Konfiguration konnte nicht geladen werden.',
  'The check could not be run.': 'Die Prüfung konnte nicht ausgeführt werden.',
  'Configuration and reasoning are read without calling anything outside the app. <b>Run check</b> also sends one small request to every AI model, Claude and Gemini, an embedding and an Unsplash search. Those calls appear in the AI logs as <code>health-check</code> and do not count against the daily limit.':
    'Konfiguration und Reasoning werden gelesen, ohne etwas außerhalb der App aufzurufen. <b>Prüfung starten</b> schickt zusätzlich je eine kleine Anfrage an jedes KI-Modell (Claude und Gemini), ein Embedding und eine Unsplash-Suche. Diese Aufrufe stehen im KI-Protokoll als <code>health-check</code> und zählen nicht zum Tageslimit.',
  'Checking…': 'Wird geprüft…',
  'Run check': 'Prüfung starten',
  'Last run {time}': 'Letzter Lauf {time}',
  'Services': 'Dienste',
  'AI models': 'KI-Modelle',
  'Not checked yet. Press Run check.': 'Noch nicht geprüft. Tippe auf „Prüfung starten“.',
  'Lowest reasoning: {level}': 'Niedrigstes Reasoning: {level}',
  'Lowest reasoning: refused': 'Niedrigstes Reasoning: abgelehnt',
  'Answered as <mono>{version}</mono>': 'Antwortete als <mono>{version}</mono>',
  'Reasoning per task': 'Reasoning pro Aufgabe',
  'Calls in the last 7 days': 'Aufrufe der letzten 7 Tage',
  'Task': 'Aufgabe',
  'Model (your settings)': 'Modell (deine Einstellungen)',
  'What ran': 'Was lief',
  'Runs at the lowest reasoning the model accepts: low effort on Claude; off on Gemini 2.5, minimal or low on Gemini 3 and later':
    'Läuft mit dem niedrigsten Reasoning, das das Modell annimmt: niedriger Aufwand bei Claude; aus bei Gemini 2.5, minimal oder niedrig ab Gemini 3',
  "Runs at the model's default reasoning": 'Läuft mit dem Standard-Reasoning des Modells',
  'lowest##reasoning': 'niedrigstes',
  'default##reasoning': 'Standard',
  'Last 7 days': 'Letzte 7 Tage',
  'Configuration': 'Konfiguration',

  // WhatsNew
  "What's new": 'Neuigkeiten',
  '{n} update since your last visit': '{n} Neuerung seit deinem letzten Besuch',
  '{n} updates since your last visit': '{n} Neuerungen seit deinem letzten Besuch',
  "Close what's new": 'Neuigkeiten schließen',
  'Release notes': 'Versionshinweise',
  'Nothing to report yet.': 'Noch nichts zu berichten.',
  'Got it##dismiss': 'Verstanden',

  // Release notes (src/lib/changelog.ts), newest first: each title, then its items
  'A calmer top bar, and everything about you in one place':
    'Eine ruhigere Kopfleiste – und alles zu dir an einem Ort',
  'On a phone, your account is now the last tab at the bottom (“You”). Settings, dark mode, What’s new, feedback and sign-out are all there, so the top bar keeps just Suggest and Add recipe. On a computer the same list opens from your avatar.':
    'Auf dem Handy ist dein Konto jetzt der letzte Tab ganz unten („Du“). Einstellungen, Dunkelmodus, Neuigkeiten, Feedback und Abmelden findest du dort, oben bleiben nur Vorschlag und Rezept hinzufügen. Am Computer öffnet sich dieselbe Liste über deinen Avatar.',
  'You can set your name (You → Your name). Your avatar then shows your initials instead of the first letter of your email address.':
    'Du kannst deinen Namen festlegen (Du → Dein Name). Dein Avatar zeigt dann deine Initialen statt des ersten Buchstabens deiner E-Mail-Adresse.',
  'Filters: one “Filters” button shows every tag at once, by group. What you choose appears beside it and can be removed with ✕. “Shared” moved to the end of the row.':
    'Filter: Ein Button „Filter“ zeigt alle Tags auf einmal, nach Gruppen sortiert. Deine Auswahl steht daneben und lässt sich mit ✕ entfernen. „Geteilt“ steht jetzt am Ende der Zeile.',
  'Collections sit on one line. “+” adds one, and “Edit” lets you rename or delete them, which was not possible on a phone before. Deleting asks first and never deletes recipes.':
    'Sammlungen stehen in einer Zeile. Mit „+“ legst du eine an, über „Bearbeiten“ kannst du sie umbenennen oder löschen – das ging auf dem Handy bisher nicht. Vor dem Löschen wird nachgefragt, und Rezepte werden dabei nie gelöscht.',
  'A recipe can start a new collection right from its own page.':
    'Aus einem Rezept heraus kannst du direkt eine neue Sammlung anlegen.',
  'The sort order is a small button beside the search, which gives the search field the room.':
    'Die Sortierung ist jetzt ein kleiner Button neben der Suche – so hat das Suchfeld mehr Platz.',
  '“What can I cook?” has been redrawn to match the rest of the app.':
    '„Was kann ich kochen?“ wurde neu gestaltet und passt jetzt zum Rest der App.',
  'Exporting your recipes now asks before it downloads.':
    'Der Export deiner Rezepte fragt jetzt nach, bevor er herunterlädt.',
  'Better search, a screen that stays on, and a way to tell us':
    'Bessere Suche, ein Bildschirm, der an bleibt, und ein Weg, uns zu schreiben',
  'Search finds more: “Kartoffel” now finds “Kartoffeln” and “Kartoffelsuppe”, “Suppe” finds “Kartoffelsuppe”, and results appear while you are still typing a word. Several words work together, and tags are searched too.':
    'Die Suche findet mehr: „Kartoffel“ findet jetzt auch „Kartoffeln“ und „Kartoffelsuppe“, „Suppe“ findet „Kartoffelsuppe“, und Ergebnisse erscheinen schon, während du noch tippst. Mehrere Wörter wirken zusammen, und auch Tags werden durchsucht.',
  'In cook mode the screen stays on, so the phone no longer dims and locks while your hands are busy. (In low power mode the phone may still decide otherwise.)':
    'Im Kochmodus bleibt der Bildschirm an – das Handy dunkelt nicht mehr ab und sperrt sich nicht, während du die Hände voll hast. (Im Stromsparmodus kann das Handy trotzdem anders entscheiden.)',
  'Shopping list: you can add your own items at the top, and “Generate” now keeps them. It used to replace the whole list.':
    'Einkaufsliste: Oben kannst du eigene Einträge hinzufügen, und „Erstellen“ behält sie jetzt. Bisher wurde die ganze Liste ersetzt.',
  'Send feedback: the account menu has a new entry for reporting a fault or sending an idea.':
    'Feedback senden: Im Konto-Menü gibt es einen neuen Eintrag, um einen Fehler zu melden oder eine Idee zu schicken.',
  '“Save as new recipe” after AI Scale is gone. It did not work, and scaling the same recipe again costs nothing extra.':
    '„Als neues Rezept speichern“ nach dem KI-Skalieren gibt es nicht mehr. Es hat nicht funktioniert, und dasselbe Rezept noch einmal zu skalieren kostet nichts extra.',
  'Speisekammer is by invitation for now, and the sign-in screen says what happens to your data.':
    'Speisekammer ist vorerst nur auf Einladung zugänglich, und die Anmeldeseite sagt, was mit deinen Daten passiert.',
  'After signing in, your recipes are there at once. The vault used to look empty until you tapped a filter or searched.':
    'Nach dem Anmelden sind deine Rezepte sofort da. Bisher wirkte der Vault leer, bis du einen Filter angetippt oder gesucht hast.',
  'The top bar fits the screen': 'Die Kopfleiste passt auf den Bildschirm',
  'On phones 360 pixels wide, many Android phones among them, the bar at the top no longer runs past the edge of the screen, so the page no longer slides sideways when you swipe.':
    'Auf Handys mit 360 Pixeln Breite – darunter viele Android-Geräte – ragt die Leiste oben nicht mehr über den Bildschirmrand. Die Seite rutscht beim Wischen also nicht mehr zur Seite.',
  'On phones its buttons sit a little closer together, and on the narrowest ones the app’s name is a little smaller.':
    'Auf Handys sitzen ihre Buttons etwas enger, und auf den schmalsten ist der Name der App etwas kleiner.',
  'On a computer, the buttons at the top no longer stick out past the right edge of the page. To make room for the tabs, Suggest is now a round wand button there, as on a phone.':
    'Am Computer ragen die Buttons oben nicht mehr über den rechten Seitenrand. Damit die Tabs Platz haben, ist Vorschlag dort jetzt ein runder Button mit Zauberstab, wie auf dem Handy.',
  'Privacy and safety fixes': 'Korrekturen für Datenschutz und Sicherheit',
  'Photos you send from your iPhone are now stored without their hidden details, such as where they were taken.':
    'Fotos, die du vom iPhone schickst, werden jetzt ohne ihre versteckten Angaben gespeichert – etwa den Aufnahmeort.',
  'Signing out now removes the offline copy of your recipes from this device, so the next person to use it cannot see them.':
    'Beim Abmelden wird jetzt die Offline-Kopie deiner Rezepte von diesem Gerät entfernt, damit die nächste Person sie nicht sehen kann.',
  'Declining an invitation to connect accounts now really declines it. It used to stay in your inbox.':
    'Eine Einladung zum Verknüpfen von Konten abzulehnen lehnt sie jetzt wirklich ab. Bisher blieb sie in deiner Inbox.',
  'Connecting accounts now needs a confirmed email address, and recipes sent to you can only be accepted from one.':
    'Konten zu verknüpfen setzt jetzt eine bestätigte E-Mail-Adresse voraus, und an dich gesendete Rezepte lassen sich nur mit einer solchen annehmen.',
  'Password reset fixed': 'Passwort zurücksetzen repariert',
  'The link in a “reset your password” email now asks for a new password, as it should. It used to sign you straight in without letting you set one.':
    'Der Link in der E-Mail zum Zurücksetzen des Passworts fragt jetzt nach einem neuen Passwort, wie es sein soll. Bisher wurdest du direkt angemeldet, ohne eines festlegen zu können.',
  'One Shortcut for pages and links': 'Ein Kurzbefehl für Seiten und Links',
  'The Safari Shortcut now takes links from Instagram and other apps too, so one entry in the share sheet does both: in Safari it reads the page you have open, anywhere else it sends the link.':
    'Der Safari-Kurzbefehl nimmt jetzt auch Links aus Instagram und anderen Apps an. Ein Eintrag im Teilen-Menü erledigt beides: In Safari liest er die geöffnete Seite, überall sonst schickt er den Link.',
  'The separate “Send link to Speisekammer” Shortcut is no longer needed, and it appeared in Safari as well. The steps for the combined one are under Settings → iPhone Shortcuts.':
    'Der separate Kurzbefehl „Send link to Speisekammer“ wird nicht mehr gebraucht – er tauchte außerdem auch in Safari auf. Die Schritte für den kombinierten findest du unter Einstellungen → iPhone-Kurzbefehle.',
  'Tidier Settings': 'Aufgeräumte Einstellungen',
  'The tabs in Settings fit on one row of a phone, and the AI models have a tab of their own instead of sitting at the end of General.':
    'Die Tabs in den Einstellungen passen auf dem Handy in eine Zeile, und die KI-Modelle haben einen eigenen Tab, statt am Ende von „Allgemein“ zu stehen.',
  'The tabs in Settings and on the admin dashboard look like the app’s main tab bar, and work with the arrow keys.':
    'Die Tabs in den Einstellungen und im Admin-Dashboard sehen aus wie die Haupt-Tableiste der App und lassen sich mit den Pfeiltasten bedienen.',
  'Recipes from Instagram': 'Rezepte von Instagram',
  'A third iPhone Shortcut, “Send link to Speisekammer”: on an Instagram post or reel, tap Share and send it. The recipe is read from the post’s caption. Set it up under Settings → iPhone Shortcuts. Links from other apps work too.':
    'Ein dritter iPhone-Kurzbefehl, „Send link to Speisekammer“: Tippe bei einem Instagram-Beitrag oder Reel auf Teilen und schick ihn ab. Das Rezept wird aus der Bildunterschrift des Beitrags gelesen. Eingerichtet wird er unter Einstellungen → iPhone-Kurzbefehle. Links aus anderen Apps funktionieren auch.',
  'An Instagram link pasted into Add recipe → Website works the same way.':
    'Ein Instagram-Link, den du unter Rezept hinzufügen → Website einfügst, funktioniert genauso.',
  'Recipes from Instagram keep their photo. Instagram’s picture links stop working after a few days, so Speisekammer now keeps its own copy.':
    'Rezepte von Instagram behalten ihr Foto. Instagrams Bildlinks funktionieren nach ein paar Tagen nicht mehr, deshalb bewahrt Speisekammer jetzt eine eigene Kopie auf.',
  'Ingredients in cook mode': 'Zutaten im Kochmodus',
  'Cook mode shows the ingredients each step needs right under it, with amounts. Tap one to tick it off.':
    'Der Kochmodus zeigt direkt unter jedem Schritt die Zutaten, die er braucht, mit Mengen. Tippe eine an, um sie abzuhaken.',
  'The full list has its own Ingredients button. On a phone it slides up from the bottom, so the step stays in view.':
    'Die ganze Liste hat einen eigenen Button „Zutaten“. Auf dem Handy fährt sie von unten herein, sodass der Schritt sichtbar bleibt.',
  'The delete confirmation has bigger buttons.': 'Die Löschbestätigung hat größere Buttons.',
  'The iPhone Shortcuts answer at once': 'Die iPhone-Kurzbefehle antworten sofort',
  'Sending a picture or a Safari page now says “Got it” as soon as it has arrived, instead of waiting while the recipe is read. The recipe appears in the vault about a minute later, marked New.':
    'Wenn du ein Bild oder eine Safari-Seite schickst, kommt jetzt sofort „Got it“, sobald alles angekommen ist – statt zu warten, bis das Rezept gelesen ist. Das Rezept erscheint etwa eine Minute später im Vault, als „Neu“ markiert.',
  'Filter by more, and combine filters': 'Nach mehr filtern und Filter kombinieren',
  'Above the vault: Diet, Cuisine, Meal, Main ingredient and More each open a menu, so every tag can be filtered by. Pick from several to combine them, for example Vegetarian and Italian.':
    'Über dem Vault öffnen Ernährung, Küche, Gericht, Hauptzutat und Mehr jeweils ein Menü, sodass sich nach jedem Tag filtern lässt. Wähle aus mehreren, um sie zu kombinieren – zum Beispiel vegetarisch und italienisch.',
  'New tags: German, Chicken, Meat, Fish & Seafood, Pasta, Salad, Casserole and Meal Prep. New recipes get them automatically; for an older one, use ⋯ → Regenerate tags.':
    'Neue Tags: Deutsch, Hähnchen, Fleisch, Fisch & Meeresfrüchte, Pasta, Salat, Auflauf und Meal Prep. Neue Rezepte bekommen sie automatisch; bei einem älteren nutze ⋯ → Tags neu erstellen.',
  'A calmer way to add recipes': 'Rezepte hinzufügen, ruhiger',
  'Adding a recipe starts with a choice: from a website, photos, a PDF or text, or Enter it manually for the full editor.':
    'Ein Rezept hinzuzufügen beginnt mit einer Auswahl: von einer Website, aus Fotos, einem PDF oder Text – oder „Selbst eingeben“ für den vollständigen Editor.',
  'While a recipe is read, the key opens the vault and puts it in. No more second message in the corner.':
    'Während ein Rezept gelesen wird, öffnet der Schlüssel den Vault und legt es hinein. Keine zweite Meldung in der Ecke mehr.',
  'Filters and tags have a cleaner look, with icons instead of emoji, and the ingredients on each card are a simple list.':
    'Filter und Tags sehen aufgeräumter aus, mit Icons statt Emoji, und die Zutaten auf jeder Karte sind eine schlichte Liste.',
  'The key now shows in the browser tab.': 'Der Schlüssel ist jetzt im Browser-Tab zu sehen.',
  'Save recipes straight from Safari': 'Rezepte direkt aus Safari speichern',
  'A second iPhone Shortcut, Save page to Speisekammer: open a recipe in Safari, tap Share and it is saved with its link. It works for sites like REWE and EDEKA that block the link import.':
    'Ein zweiter iPhone-Kurzbefehl, „Save page to Speisekammer“: Öffne ein Rezept in Safari, tippe auf Teilen, und es wird samt Link gespeichert. Das klappt auch bei Seiten wie REWE und EDEKA, die den Import per Link blockieren.',
  'Set it up under Settings → iPhone Shortcuts. It uses the same key as the Photos Shortcut, and needs Allow Running Scripts turned on once in the Shortcuts settings.':
    'Eingerichtet wird er unter Einstellungen → iPhone-Kurzbefehle. Er nutzt denselben Schlüssel wie der Fotos-Kurzbefehl; dafür muss in den Einstellungen der Kurzbefehle-App einmal „Ausführen von Skripten erlauben“ eingeschaltet werden.',
  'When a website will not share its recipe': 'Wenn eine Website ihr Rezept nicht herausgibt',
  'Some sites, REWE and EDEKA among them, block apps from reading their pages. Instead of "Forbidden" you now see which site it is and three ways that work: paste the text, save the page as a PDF, or use screenshots. The link stays with the recipe.':
    'Manche Seiten, darunter REWE und EDEKA, lassen Apps ihre Seiten nicht lesen. Statt „Forbidden“ siehst du jetzt, um welche Seite es geht, und drei Wege, die funktionieren: den Text einfügen, die Seite als PDF sichern oder Screenshots verwenden. Der Link bleibt beim Rezept.',
  'Add the iPhone Shortcut with one tap': 'Den iPhone-Kurzbefehl mit einem Tipp hinzufügen',
  'Settings → iPhone Shortcut now has an Add to Shortcuts button. Make your key, copy it, tap the button, and paste the key when the Shortcuts app asks for it. No need to build the Shortcut yourself any more.':
    'Unter Einstellungen → iPhone-Kurzbefehl gibt es jetzt einen Button „Zu Kurzbefehle hinzufügen“. Erstelle deinen Schlüssel, kopiere ihn, tippe auf den Button und füge den Schlüssel ein, wenn die Kurzbefehle-App danach fragt. Den Kurzbefehl selbst zu bauen ist nicht mehr nötig.',
  'Send recipes straight from your photos': 'Rezepte direkt aus deinen Fotos senden',
  'With an iPhone Shortcut you can now send recipes from the Photos app: select one or more pictures, tap Share, then Send to Speisekammer. Several pages become one recipe, or one recipe per picture if you prefer. Set it up once under Settings → iPhone Shortcut.':
    'Mit einem iPhone-Kurzbefehl kannst du jetzt Rezepte aus der Fotos-App senden: ein oder mehrere Bilder auswählen, auf Teilen tippen, dann „Send to Speisekammer“. Mehrere Seiten werden zu einem Rezept – oder zu einem Rezept pro Bild, wenn dir das lieber ist. Einmal einrichten unter Einstellungen → iPhone-Kurzbefehl.',
  'Recipes sent this way are saved straight away. The next time you open the app a banner shows what arrived, each new recipe carries a New badge until you open it, and anything that could not be read is listed with the reason.':
    'So gesendete Rezepte werden sofort gespeichert. Beim nächsten Öffnen der App zeigt ein Banner, was angekommen ist; jedes neue Rezept trägt die Markierung „Neu“, bis du es öffnest, und alles, was nicht gelesen werden konnte, wird mit dem Grund aufgeführt.',
  'Claude does the AI work now, with Gemini standing by':
    'Claude übernimmt jetzt die KI-Arbeit, Gemini steht bereit',
  "Reading recipes from photos, PDFs and web pages, translating, tagging, nutrition and the rest now run on Anthropic's Claude.":
    'Rezepte aus Fotos, PDFs und Webseiten lesen, übersetzen, Tags vergeben, Nährwerte schätzen und alles Weitere läuft jetzt auf Claude von Anthropic.',
  "Photos you take of a cookbook page or a handwritten card go to Claude's strongest model, which reads curved pages and handwriting best. Screenshots are recognised (by what the camera records in a photo, and by the shape of a phone screen) and read by the faster model, since their text is already clean.":
    'Fotos, die du von einer Kochbuchseite oder einer handgeschriebenen Karte machst, gehen an Claudes stärkstes Modell – es liest gewölbte Seiten und Handschrift am besten. Screenshots werden erkannt (an dem, was die Kamera in einem Foto festhält, und an der Form eines Handybildschirms) und vom schnelleren Modell gelesen, weil ihr Text schon sauber ist.',
  "Google's Gemini stays ready behind it: if Claude is busy or unavailable, the same request goes to Gemini straight away, so a problem at one of them no longer stops the app.":
    'Googles Gemini bleibt dahinter in Bereitschaft: Ist Claude ausgelastet oder nicht erreichbar, geht dieselbe Anfrage sofort an Gemini. Ein Problem bei einem der beiden legt die App also nicht mehr lahm.',
  'One set of AI models for everyone': 'Ein Satz KI-Modelle für alle',
  "The AI models are now chosen once, for everyone, by the app's admin. Choosing your own could put a task on a model this app has no allowance for, and then every call to it failed.":
    'Die KI-Modelle werden jetzt einmal für alle festgelegt, vom Admin der App. Bei eigener Wahl konnte eine Aufgabe auf einem Modell landen, für das diese App kein Kontingent hat – und dann schlug jeder Aufruf fehl.',
  'Settings still shows which model each task runs on, and what it actually ran as on your recent calls.':
    'Die Einstellungen zeigen weiterhin, auf welchem Modell jede Aufgabe läuft und als welches Modell sie bei deinen letzten Aufrufen tatsächlich gelaufen ist.',
  'Fewer failed imports when Gemini is busy':
    'Weniger gescheiterte Importe, wenn Gemini ausgelastet ist',
  'Importing a recipe from a photo or a PDF now waits and tries again when the AI model is busy, as every other AI feature already did. Before, a single busy moment made the import fail straight away.':
    'Der Import eines Rezepts aus einem Foto oder PDF wartet jetzt und versucht es erneut, wenn das KI-Modell ausgelastet ist – wie alle anderen KI-Funktionen schon bisher. Vorher ließ ein einziger voller Moment den Import sofort scheitern.',
  'If the chosen model stays busy or has used up its daily allowance, the app now asks the other model instead of giving up. This works for every AI feature.':
    'Bleibt das gewählte Modell ausgelastet oder ist sein Tageskontingent aufgebraucht, fragt die App jetzt das andere Modell, statt aufzugeben. Das gilt für jede KI-Funktion.',
  'Tags, nutrition and translations on the Lite model':
    'Tags, Nährwerte und Übersetzungen auf dem Lite-Modell',
  'If you chose the Lite model for tagging, nutrition or translation, those failed every time: the app asked the model to switch its reasoning off in a way newer Gemini models no longer accept. It now asks each model for the lowest reasoning it offers, and falls back to its default if it refuses.':
    'Wer für Tags, Nährwerte oder Übersetzungen das Lite-Modell gewählt hatte, bekam jedes Mal einen Fehler: Die App bat das Modell, sein Reasoning abzuschalten – auf eine Art, die neuere Gemini-Modelle nicht mehr annehmen. Jetzt fragt sie jedes Modell nach der niedrigsten Reasoning-Stufe, die es anbietet, und nimmt dessen Standard, wenn es ablehnt.',
  'Fixed for iPhone, and clearer recipe cards': 'Repariert fürs iPhone, und klarere Rezeptkarten',
  'On an iPhone the header sat behind the clock and the camera, where a tap goes to the phone instead of the app. That is why its buttons did nothing and looked blurred. It now starts just below them, and so do the close buttons of a recipe, cook mode and the photo viewer, and the notices that pop up. The buttons at the foot of cook mode no longer sit on the home bar.':
    'Auf dem iPhone saß die Kopfleiste hinter Uhr und Kamera, wo ein Tipp beim Telefon landet statt bei der App. Deshalb taten ihre Buttons nichts und sahen unscharf aus. Jetzt beginnt sie knapp darunter – genauso wie die Schließen-Buttons von Rezept, Kochmodus und Fotoansicht und die eingeblendeten Hinweise. Die Buttons unten im Kochmodus liegen nicht mehr auf dem Home-Balken.',
  'The header is also more solid, so a photo scrolling underneath no longer smears behind its buttons.':
    'Die Kopfleiste ist außerdem deckender, sodass ein Foto, das darunter durchscrollt, nicht mehr hinter den Buttons verschmiert.',
  'Each recipe now has a fine edge and a soft shadow, with more room between them, so it is clear where one recipe ends and the next begins.':
    'Jedes Rezept hat jetzt eine feine Kante und einen weichen Schatten, mit mehr Abstand dazwischen – so ist klar, wo ein Rezept endet und das nächste beginnt.',
  'A new look: glass': 'Ein neuer Look: Glas',
  'The tab bar now floats over the page as a glass capsule, and a tinted pill slides to the tab you choose. On a phone the page runs out softly beneath it. The header, the dropdown menus and the small round buttons that sit on photos are glass too.':
    'Die Tableiste schwebt jetzt als Glaskapsel über der Seite, und eine getönte Pille gleitet zu dem Tab, den du wählst. Auf dem Handy läuft die Seite darunter weich aus. Auch die Kopfleiste, die Dropdown-Menüs und die kleinen runden Buttons auf Fotos sind aus Glas.',
  'Everything you can tap now answers: it fades the moment you touch it and recovers when you let go. Buttons and filters also give a little, and the main green buttons get darker instead of paler.':
    'Alles, was du antippen kannst, antwortet jetzt: Es verblasst in dem Moment, in dem du es berührst, und erholt sich, wenn du loslässt. Buttons und Filter geben außerdem ein wenig nach, und die grünen Haupt-Buttons werden dunkler statt blasser.',
  'If your device is set to reduce transparency, the glass becomes solid. If it is set to reduce motion, nothing slides or springs; a tap is still acknowledged by the change in colour.':
    'Ist auf deinem Gerät „Transparenz reduzieren“ eingestellt, wird das Glas deckend. Bei „Bewegung reduzieren“ gleitet und federt nichts; ein Tipp wird trotzdem durch den Farbwechsel bestätigt.',
  'Translating no longer gets stuck': 'Übersetzen bleibt nicht mehr hängen',
  'Opening a recipe could start a translation by itself and lock every language until it finished. A translation now only starts when you choose a language, and while it is being made you can still pick any other language, or the original, to stop it.':
    'Das Öffnen eines Rezepts konnte von selbst eine Übersetzung starten und alle Sprachen sperren, bis sie fertig war. Eine Übersetzung startet jetzt nur noch, wenn du eine Sprache wählst – und während sie entsteht, kannst du weiterhin jede andere Sprache oder das Original wählen, um sie abzubrechen.',
  'A translation that fails, or that you delete, no longer leaves the recipe set to a language it has no text for.':
    'Eine Übersetzung, die fehlschlägt oder die du löschst, lässt das Rezept nicht mehr auf einer Sprache stehen, für die es keinen Text hat.',
  'While you are reading a translation, the language picker now offers "Delete this translation" right there. The menu behind the three dots still lists every stored translation.':
    'Während du eine Übersetzung liest, bietet die Sprachauswahl jetzt direkt „Diese Übersetzung löschen“ an. Das Menü hinter den drei Punkten listet weiterhin jede gespeicherte Übersetzung auf.',
  'Deleting a translation really deletes it': 'Eine Übersetzung löschen löscht sie wirklich',
  'Deleting a translation removed the tick but not the translation: choosing the language again showed the same text as before, and no new one was made until you reloaded the app. A deleted translation is now gone, and choosing the language again makes a fresh one.':
    'Beim Löschen einer Übersetzung verschwand das Häkchen, aber nicht die Übersetzung: Wer die Sprache erneut wählte, sah denselben Text wie zuvor, und bis zum Neuladen der App entstand keine neue. Eine gelöschte Übersetzung ist jetzt weg, und die Sprache erneut zu wählen erzeugt eine frische.',
  'The language picker is tidier. The small crosses on the languages are gone; deleting a translation is rare, so it has moved into the menu behind the three dots.':
    'Die Sprachauswahl ist aufgeräumter. Die kleinen Kreuze an den Sprachen sind weg; eine Übersetzung zu löschen kommt selten vor, deshalb ist es ins Menü hinter den drei Punkten gewandert.',
  'Sending a recipe keeps it open': 'Beim Senden bleibt das Rezept offen',
  'When you send a recipe to a friend, the recipe now stays open behind the email form. Before, it closed as soon as the form appeared, so after sending or cancelling you were back in the vault and had to find the recipe again.':
    'Wenn du ein Rezept an jemanden sendest, bleibt es jetzt hinter dem E-Mail-Formular geöffnet. Bisher schloss es sich, sobald das Formular erschien – nach dem Senden oder Abbrechen warst du wieder im Vault und musstest das Rezept neu suchen.',
  'Translations keep their steps': 'Übersetzungen behalten ihre Schritte',
  'A translated recipe could come back with several steps run together into one point. Each step is now translated on its own, and a translation whose number of steps does not match the recipe is thrown away and asked for again instead of being saved.':
    'Ein übersetztes Rezept konnte mit mehreren Schritten zurückkommen, die zu einem einzigen Punkt zusammengezogen waren. Jeder Schritt wird jetzt einzeln übersetzt, und eine Übersetzung, deren Schrittzahl nicht zum Rezept passt, wird verworfen und neu angefordert, statt gespeichert zu werden.',
  'A translation saved before this fix stays as it is. To correct one, open the language menu on that recipe, delete the language, and choose it again.':
    'Eine Übersetzung, die vor dieser Korrektur gespeichert wurde, bleibt, wie sie ist. Um eine zu korrigieren, öffne das Sprachmenü des Rezepts, lösche die Sprache und wähle sie erneut.',
  'Fix for a page that kept reloading': 'Korrektur für eine Seite, die sich ständig neu lud',
  'On some browsers the app could reload itself over and over, flickering and impossible to use. That was a fault in an earlier fix: when a part of the app would not load, it reloaded the page to recover — and then did so again on every reload. It now reloads once at most.':
    'In manchen Browsern konnte sich die App immer wieder selbst neu laden – flackernd und unbenutzbar. Das war ein Fehler in einer früheren Korrektur: Wenn ein Teil der App nicht laden wollte, lud sie die Seite neu, um sich zu erholen – und tat das dann bei jedem Neuladen wieder. Jetzt lädt sie höchstens einmal neu.',
  'If part of the app still cannot be loaded after that, you now get a message that says so, with a button to reload and one to reset the saved app files, instead of a blank or flickering page.':
    'Lässt sich ein Teil der App danach immer noch nicht laden, bekommst du jetzt eine Meldung, die das sagt – mit einem Button zum Neuladen und einem zum Zurücksetzen der gespeicherten App-Dateien – statt einer leeren oder flackernden Seite.',
  'Paste a recipe as text': 'Ein Rezept als Text einfügen',
  'Adding a recipe has a fourth way in: Text. Paste a recipe from a chat message, a note or another app — ingredients and steps in any order — and it is sorted into the form for you to check, in the language it was written in.':
    'Rezepte hinzufügen hat einen vierten Weg: Text. Füge ein Rezept aus einer Chatnachricht, einer Notiz oder einer anderen App ein – Zutaten und Schritte in beliebiger Reihenfolge –, und es wird für dich ins Formular einsortiert, zum Prüfen und in der Sprache, in der es geschrieben wurde.',
  'If what you pasted turns out not to be a recipe, you are told so instead of getting an invented one, and your text stays in the box.':
    'Stellt sich heraus, dass dein eingefügter Text kein Rezept ist, erfährst du das, statt ein erfundenes zu bekommen, und dein Text bleibt im Feld stehen.',
  'Translations that come out wrong are no longer kept':
    'Missratene Übersetzungen werden nicht mehr behalten',
  'A translation could come back with stray text from the AI in the middle of the title, and was saved like that — so the recipe stayed broken in that language until you deleted it. Such a result is now thrown away and asked for again, and if the second try is no better you get a message instead of a damaged recipe.':
    'Eine Übersetzung konnte mit verirrtem Text der KI mitten im Titel zurückkommen und wurde so gespeichert – das Rezept blieb in dieser Sprache kaputt, bis du sie gelöscht hast. Ein solches Ergebnis wird jetzt verworfen und neu angefordert, und wenn der zweite Versuch nicht besser ist, bekommst du eine Meldung statt eines beschädigten Rezepts.',
  'Tags and nutrition appear sooner after you save a recipe.':
    'Tags und Nährwerte erscheinen schneller, nachdem du ein Rezept gespeichert hast.',
  'Fixes for a blank page and for deleting translations':
    'Korrekturen für eine leere Seite und fürs Löschen von Übersetzungen',
  'After an update, the app could open as a blank white page on a device that still had the previous version cached — it now notices and reloads itself once.':
    'Nach einem Update konnte sich die App auf einem Gerät, das noch die vorherige Version im Cache hatte, als leere weiße Seite öffnen – sie bemerkt das jetzt und lädt sich einmal neu.',
  'A translation of the recipe’s own original language could not be deleted, which was exactly the one you would want to remove when it came out wrong.':
    'Eine Übersetzung in die Originalsprache des Rezepts ließ sich nicht löschen – genau die, die man entfernen möchte, wenn sie missraten ist.',
  'Better shared links, and a fix for translation':
    'Bessere geteilte Links und eine Korrektur fürs Übersetzen',
  'Translating a recipe from a connected account used to fail outright. It now works — the check behind it was asking whether you owned the recipe rather than whether you could see it.':
    'Ein Rezept aus einem verknüpften Konto zu übersetzen schlug bisher glatt fehl. Jetzt funktioniert es – die Prüfung dahinter fragte, ob dir das Rezept gehört, statt ob du es sehen darfst.',
  'A shared link pasted into WhatsApp, Slack or a message now shows the recipe’s name and photo instead of a bare address. Shared recipes are kept out of search engines.':
    'Ein geteilter Link, den du in WhatsApp, Slack oder eine Nachricht einfügst, zeigt jetzt Namen und Foto des Rezepts statt einer nackten Adresse. Geteilte Rezepte bleiben aus Suchmaschinen heraus.',
  'Guests can now see all of a recipe’s photos, its nutrition, switch between any languages you had already translated it into, and flip between °C and °F.':
    'Gäste sehen jetzt alle Fotos eines Rezepts und seine Nährwerte, können zwischen allen Sprachen wechseln, in die du es schon übersetzt hattest, und zwischen °C und °F umschalten.',
  'Saving a shared recipe as a PDF now names the file after the recipe.':
    'Wer ein geteiltes Rezept als PDF sichert, bekommt jetzt eine Datei, die nach dem Rezept benannt ist.',
  'Recipes with a live public link are marked in your vault, and there is a new "Shared" filter to see them all at once.':
    'Rezepte mit aktivem öffentlichem Link sind in deinem Vault markiert, und ein neuer Filter „Geteilt“ zeigt sie alle auf einmal.',
  'Polish is no longer offered as a translation language.':
    'Polnisch wird nicht mehr als Übersetzungssprache angeboten.',
  'The language picker now ticks the languages a recipe has already been translated into — those open instantly and cost nothing — and lets you delete any of them you no longer want.':
    'Die Sprachauswahl hakt jetzt die Sprachen ab, in die ein Rezept schon übersetzt wurde – die öffnen sich sofort und kosten nichts –, und du kannst jede löschen, die du nicht mehr brauchst.',
  'The options menu behind the three dots no longer runs off the side of the screen on a narrow phone, where half its labels used to be cut off.':
    'Das Optionsmenü hinter den drei Punkten ragt auf einem schmalen Handy nicht mehr seitlich aus dem Bildschirm, wo bisher die Hälfte der Einträge abgeschnitten war.',
  'Added to your home screen, the app now shows its own key symbol on the deep green of the app itself — and is called Speisekammer, not the old name it had kept there.':
    'Auf dem Home-Bildschirm zeigt die App jetzt ihr eigenes Schlüsselsymbol auf dem tiefen Grün der App – und heißt Speisekammer, nicht mehr so wie früher.',
  'Share a recipe with someone who has no account':
    'Ein Rezept mit jemandem teilen, der kein Konto hat',
  'Open a recipe, choose "Create public link", and send it to anyone — they can read the whole recipe without signing up or installing anything.':
    'Öffne ein Rezept, wähle „Öffentlichen Link erstellen“ und schick ihn an wen du willst – das ganze Rezept lässt sich lesen, ohne Anmeldung und ohne etwas zu installieren.',
  'They can change the servings and the amounts follow, step through cook mode with its timers, and print or save it as a PDF.':
    'Gäste können die Portionen ändern, und die Mengen passen sich an; sie können den Kochmodus mit seinen Timern durchgehen und das Rezept drucken oder als PDF sichern.',
  'Sharing is per recipe and off until you turn it on. "Stop sharing" takes the link down again, and anyone still holding it sees nothing.':
    'Geteilt wird pro Rezept, und erst, wenn du es einschaltest. „Freigabe beenden“ nimmt den Link wieder vom Netz, und wer ihn noch hat, sieht nichts mehr.',
  'Your private notes and ratings are never part of a shared link, even though they sit on the same recipe.':
    'Deine privaten Notizen und Bewertungen sind nie Teil eines geteilten Links, obwohl sie am selben Rezept hängen.',
  'The old "Copy share link" button handed out a link that only worked for people who already had an account; it now creates a link that genuinely works for anyone.':
    'Der alte Button „Link kopieren“ gab einen Link heraus, der nur für Leute mit Konto funktionierte; jetzt entsteht ein Link, der wirklich für alle funktioniert.',
  'Cook mode now fills the screen on a laptop or desktop again, instead of being squeezed into a narrow column.':
    'Der Kochmodus füllt auf Laptop und Desktop wieder den ganzen Bildschirm, statt in eine schmale Spalte gequetscht zu sein.',
  'A shared link now also introduces the app to whoever opens it, with a new "About" page at /about listing everything it can do — reachable from the sign-in screen too.':
    'Ein geteilter Link stellt die App jetzt auch allen vor, die ihn öffnen – mit einer neuen Seite „Über“ unter /about, die alles auflistet, was sie kann. Erreichbar ist sie auch von der Anmeldeseite.',
  'The app goes by one name everywhere now: Speisekammer, including the browser tab and the installed app on your phone.':
    'Die App trägt jetzt überall denselben Namen: Speisekammer – auch im Browser-Tab und als installierte App auf deinem Handy.',
  'Shared pages follow your device’s light or dark setting, which they previously ignored.':
    'Geteilte Seiten folgen der Hell- oder Dunkel-Einstellung deines Geräts, die sie bisher ignoriert haben.',
  "Moved to Google's Gemini 4 models": 'Umzug auf Googles Gemini-4-Modelle',
  'Recipe extraction, tagging and the rest now run on Gemini 4, the generation that replaced the models this app was using.':
    'Rezepte auslesen, Tags vergeben und alles Weitere läuft jetzt auf Gemini 4, der Generation, die die bisher genutzten Modelle abgelöst hat.',
  'The old model tier had been returning "high demand" errors; the new one is answering normally.':
    'Die alte Modellstufe hatte Fehler wegen „hoher Nachfrage“ gemeldet; die neue antwortet normal.',
  "A failed AI request now explains itself instead of showing Google's raw error, and says when the problem is ours rather than your recipe.":
    'Eine gescheiterte KI-Anfrage erklärt sich jetzt selbst, statt Googles rohen Fehler zu zeigen, und sagt, wenn das Problem bei uns liegt und nicht an deinem Rezept.',
  'Requests that fail because the service is briefly busy are retried automatically — previously that only worked for the quick tasks, never for recipe extraction.':
    'Anfragen, die scheitern, weil der Dienst kurz ausgelastet ist, werden automatisch wiederholt – bisher klappte das nur bei den schnellen Aufgaben, nie beim Auslesen von Rezepten.',
  'Ratings you each own, and a faster brain':
    'Bewertungen, die jedem selbst gehören, und ein schnelleres Gehirn',
  'You and anyone you are connected with can now rate the same recipe separately. Your stars are yours; theirs appear underneath.':
    'Du und alle, mit denen du verknüpft bist, könnt dasselbe Rezept jetzt getrennt bewerten. Deine Sterne gehören dir; die der anderen stehen darunter.',
  'Filtering the vault by a connected person actually works. Picking someone used to leave every recipe on screen.':
    'Den Vault nach einer verknüpften Person zu filtern funktioniert jetzt wirklich. Bisher blieben bei der Auswahl alle Rezepte stehen.',
  'Each AI task can run on its own model. Put tagging and shopping lists on the cheap one and keep extraction on the capable one, in Settings.':
    'Jede KI-Aufgabe kann auf einem eigenen Modell laufen. Leg in den Einstellungen Tags und Einkaufslisten auf das günstige und lass das Auslesen auf dem leistungsfähigen.',
  'Settings can be saved again. Changing your model or temperature unit had been silently failing.':
    'Einstellungen lassen sich wieder speichern. Das Ändern des Modells oder der Temperatureinheit war stillschweigend gescheitert.',
  'Recipe extraction now uses Google’s current Gemini release automatically, so it keeps improving without an update.':
    'Das Auslesen von Rezepten nutzt jetzt automatisch Googles aktuelle Gemini-Version und wird so ohne Update immer besser.',
  'AI requests retry themselves when Google is briefly overloaded, instead of showing you an error.':
    'KI-Anfragen wiederholen sich selbst, wenn Google kurz überlastet ist, statt dir einen Fehler zu zeigen.',
  'The notes field no longer calls itself “Personal”. It now says who can actually read it.':
    'Das Notizfeld nennt sich nicht mehr „Persönlich“. Es sagt jetzt, wer es tatsächlich lesen kann.',
  'Installed app on a phone: new versions arrive on their own rather than needing a reinstall.':
    'Installierte App auf dem Handy: Neue Versionen kommen von selbst an, ohne Neuinstallation.',

  // 2026-12-20
  'Speisekammer now speaks German': 'Speisekammer spricht jetzt Deutsch',
  'The whole app is available in German as well as English. It follows the language of your phone or computer.':
    'Die ganze App gibt es jetzt auf Deutsch und Englisch, passend zur Sprache deines Handys oder Computers.',
  'To choose yourself, open Settings → General → Language. The choice is kept on that device.':
    'Wenn du selbst wählen möchtest: Einstellungen → Allgemein → Sprache. Die Wahl wird auf dem jeweiligen Gerät gespeichert.',
  'Your recipes stay in the language they were written in; translating a recipe works as before.':
    'Deine Rezepte bleiben in der Sprache, in der sie geschrieben wurden; ein Rezept übersetzen kannst du wie bisher.',
};

export default admin;
