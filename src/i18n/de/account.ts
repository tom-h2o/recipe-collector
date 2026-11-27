/**
 * German: signing in, the account menu, Settings (general, AI models,
 * connections, usage), the iPhone Shortcuts, feedback and the failure screens.
 *
 * The names of Apple's Shortcuts actions follow the German Shortcuts app
 * („Kurzbefehle“) as far as known; the steps tell the person what to look for,
 * so a name that differs slightly on their iOS version is still found.
 */
const account: Record<string, string> = {
  // ── Sign-in screen (AuthGate) ──────────────────────────────────────────────
  'Something went wrong. Please try again.': 'Etwas ist schiefgegangen. Bitte versuch es noch einmal.',
  'Something went wrong.': 'Etwas ist schiefgegangen.',
  'Confirmation email resent! Check your inbox.': 'Bestätigungsmail erneut gesendet! Schau in dein Postfach.',
  'Password set. Welcome to Speisekammer!': 'Passwort festgelegt. Willkommen bei Speisekammer!',
  'Password updated! You are now signed in.': 'Passwort geändert! Du bist jetzt angemeldet.',
  'Welcome to Speisekammer': 'Willkommen bei Speisekammer',
  'Set New Password': 'Neues Passwort festlegen',
  'Your invitation worked. Choose a password, so you can sign in again later.':
    'Deine Einladung hat funktioniert. Wähle ein Passwort, damit du dich später wieder anmelden kannst.',
  'Choose a new password for your account.': 'Wähle ein neues Passwort für dein Konto.',
  'New password': 'Neues Passwort',
  'Min. 8 characters': 'Mind. 8 Zeichen',
  'Hide password': 'Passwort verbergen',
  'Show password': 'Passwort anzeigen',
  'Set password': 'Passwort festlegen',
  'Set new password': 'Neues Passwort festlegen',
  'Toggle dark mode': 'Dunkelmodus umschalten',
  'Sign in to access your recipes': 'Melde dich an, um zu deinen Rezepten zu kommen',
  'New here? <a>See what Speisekammer does</a>': 'Neu hier? <a>Sieh dir an, was Speisekammer kann</a>',
  'Accounts are by invitation for now.': 'Konten gibt es vorerst nur auf Einladung.',
  'Magic Link': 'Magic Link',
  'Email address': 'E-Mail-Adresse',
  'you@example.com': 'du@beispiel.de',
  'Reset password or set one for the first time →': 'Passwort zurücksetzen oder zum ersten Mal festlegen →',
  'Please wait…': 'Bitte warten…',
  'Create account': 'Konto erstellen',
  'Sign in': 'Anmelden',
  'Forgot password?': 'Passwort vergessen?',
  'Already have an account? Sign in': 'Schon ein Konto? Anmelden',
  "Don't have an account? Sign up": 'Noch kein Konto? Registrieren',
  'Check your inbox': 'Schau in dein Postfach',
  'Check your inbox!': 'Schau in dein Postfach!',
  'We sent a confirmation link to <b>{email}</b>. Click it to activate your account, then sign in here.':
    'Wir haben einen Bestätigungslink an <b>{email}</b> geschickt. Klick ihn an, um dein Konto zu aktivieren, und melde dich dann hier an.',
  'Resend confirmation email': 'Bestätigungsmail erneut senden',
  "Enter your email and we'll send a link to set a new password. This also works if you've never set a password (e.g. you always used magic link).":
    'Gib deine E-Mail-Adresse ein, und wir schicken dir einen Link, mit dem du ein neues Passwort festlegst. Das geht auch, wenn du noch nie ein Passwort hattest (z. B. weil du immer den Magic Link benutzt hast).',
  'Send reset link': 'Link zum Zurücksetzen senden',
  '← Back to sign in': '← Zurück zur Anmeldung',
  'Back to sign in': 'Zurück zur Anmeldung',
  'We sent a password reset link to <b>{email}</b>': 'Wir haben einen Link zum Zurücksetzen an <b>{email}</b> geschickt',
  'Send Magic Link': 'Magic Link senden',
  'We sent a magic link to <b>{email}</b>': 'Wir haben einen Magic Link an <b>{email}</b> geschickt',
  'Use a different email': 'Andere E-Mail-Adresse verwenden',
  'What happens to your data': 'Was mit deinen Daten passiert',
  'Sign in failed — please try again or use a magic link.':
    'Anmeldung fehlgeschlagen. Bitte versuch es noch einmal oder nimm einen Magic Link.',

  // What Supabase Auth (GoTrue) answers, shown inline
  'Invalid login credentials': 'E-Mail-Adresse oder Passwort stimmt nicht.',
  'Email not confirmed': 'Deine E-Mail-Adresse ist noch nicht bestätigt.',
  'User already registered': 'Für diese Adresse gibt es schon ein Konto.',
  'Password should be at least 8 characters.': 'Das Passwort muss mindestens 8 Zeichen haben.',
  'Password should be at least 8 characters': 'Das Passwort muss mindestens 8 Zeichen haben.',
  'Password should be at least {n} characters.': 'Das Passwort muss mindestens {n} Zeichen haben.',
  'For security purposes, you can only request this after {n} seconds.':
    'Aus Sicherheitsgründen kannst du das erst in {n} Sekunden wieder anfordern.',
  'For security purposes, you can only request this once every {n} seconds':
    'Aus Sicherheitsgründen kannst du das nur alle {n} Sekunden anfordern.',
  'New password should be different from the old password.': 'Das neue Passwort muss sich vom alten unterscheiden.',
  'Email rate limit exceeded': 'Zu viele E-Mails in kurzer Zeit. Bitte versuch es später noch einmal.',
  'Signups not allowed for this instance': 'Neue Konten können hier zurzeit nicht angelegt werden.',
  'Signups not allowed for otp': 'Für diese Adresse gibt es kein Konto.',
  'Unable to validate email address: invalid format': 'Das ist keine gültige E-Mail-Adresse.',
  'Email link is invalid or has expired': 'Der Link aus der E-Mail ist ungültig oder abgelaufen.',
  'Auth session missing!': 'Du bist nicht mehr angemeldet. Bitte melde dich neu an.',
  'Password is known to be weak and easy to guess, please choose a different one.':
    'Dieses Passwort ist bekannt und leicht zu erraten. Bitte wähle ein anderes.',
  'Request rate limit reached': 'Zu viele Anfragen. Bitte versuch es gleich noch einmal.',
  'Failed to fetch': 'Keine Verbindung. Bitte prüfe deine Internetverbindung.',
  'Network error': 'Netzwerkfehler',

  // ── Account menu (UserMenu) ────────────────────────────────────────────────
  'delete##the word to type': 'löschen',
  'The name could not be saved. Please try again.': 'Der Name konnte nicht gespeichert werden. Bitte versuch es noch einmal.',
  'Name saved.': 'Name gespeichert.',
  'Name removed.': 'Name entfernt.',
  'Password updated!': 'Passwort geändert!',
  'Exporting recipes…': 'Rezepte werden exportiert…',
  'Exported {n} recipe': '{n} Rezept exportiert',
  'Exported {n} recipes': '{n} Rezepte exportiert',
  'Export failed': 'Export fehlgeschlagen',
  'Account deleted.': 'Konto gelöscht.',
  'Failed to delete account': 'Das Konto konnte nicht gelöscht werden.',
  'Account menu, new updates available': 'Kontomenü, es gibt Neuigkeiten',
  'Account menu': 'Kontomenü',
  'Signed in with Google': 'Mit Google angemeldet',
  'Your name': 'Dein Name',
  'Switch to light mode': 'Zum hellen Modus wechseln',
  'Switch to dark mode': 'Zum Dunkelmodus wechseln',
  'Dark mode': 'Dunkelmodus',
  "What's new": 'Neuigkeiten',
  'unread updates': 'ungelesene Neuigkeiten',
  'Send feedback': 'Feedback senden',
  'Export recipes': 'Rezepte exportieren',
  'Change password': 'Passwort ändern',
  'Sign out': 'Abmelden',
  'Delete account': 'Konto löschen',
  'You': 'Du',
  'Shown in your account and used for the letters on your avatar.':
    'Wird in deinem Konto angezeigt und für die Buchstaben auf deinem Avatar verwendet.',
  'Name': 'Name',
  'e.g. Anna Schmidt': 'z. B. Anna Schmidt',
  'Export your recipes?': 'Deine Rezepte exportieren?',
  'Downloads one file (JSON) with all your own recipes: text, tags, nutrition and notes. Photo files are not in it, only their addresses.':
    'Lädt eine Datei (JSON) mit all deinen eigenen Rezepten herunter: Text, Tags, Nährwerte und Notizen. Die Fotos selbst sind nicht enthalten, nur ihre Adressen.',
  'Export': 'Exportieren',
  'Save password': 'Passwort speichern',
  'This will permanently delete your account and all your recipes, meal plans, and settings. This cannot be undone.':
    'Damit werden dein Konto und alle deine Rezepte, Wochenpläne und Einstellungen endgültig gelöscht. Das lässt sich nicht rückgängig machen.',
  'Type <word>{word}</word> to confirm.': 'Tippe zur Bestätigung <word>{word}</word> ein.',
  'Deleting…': 'Löscht…',

  // ── Settings ───────────────────────────────────────────────────────────────
  'General': 'Allgemein',
  'AI models': 'KI-Modelle',
  'AI': 'KI',
  'Connections': 'Verknüpfungen',
  'Usage': 'Nutzung',
  'Preferences, Shortcuts, AI models and more.': 'Vorlieben, Kurzbefehle, KI-Modelle und mehr.',
  'Settings sections': 'Bereiche der Einstellungen',
  'System': 'System',
  'Follows your device unless you choose one. Stored on this device.':
    'Folgt deinem Gerät, solange du keine wählst. Wird auf diesem Gerät gespeichert.',
  'Temperature Unit': 'Temperatureinheit',
  'All temperatures in recipes will be displayed in your preferred unit.':
    'Alle Temperaturen in Rezepten werden in deiner bevorzugten Einheit angezeigt.',
  'You are the admin: the AI models below apply to everyone using the app. Nobody else can change them.':
    'Du bist Admin: Die KI-Modelle unten gelten für alle, die die App nutzen. Niemand sonst kann sie ändern.',
  'Main model': 'Hauptmodell',
  'Select model': 'Modell wählen',
  'Used by every task that has no model of its own below.': 'Gilt für jede Aufgabe, die unten kein eigenes Modell hat.',
  'alias': 'Alias',
  'last run {date}': 'zuletzt am {date}',
  'not used yet': 'noch nicht verwendet',
  'What each model actually ran as, taken from your own recent AI calls — an alias can point somewhere different without warning.':
    'Als was jedes Modell tatsächlich gelaufen ist, abgelesen an deinen letzten KI-Aufrufen. Ein Alias kann ohne Vorwarnung auf etwas anderes zeigen.',
  'Model per task': 'Modell pro Aufgabe',
  'Reading a photographed page is far harder than tagging a recipe you already have. Put the cheap tasks on Haiku and keep extraction on a stronger model. A Claude model that fails hands the task to Gemini automatically.':
    'Eine fotografierte Seite zu lesen ist viel schwerer, als ein vorhandenes Rezept zu taggen. Leg die einfachen Aufgaben auf Haiku und lass das Einlesen auf einem stärkeren Modell. Fällt ein Claude-Modell aus, übernimmt automatisch Gemini.',
  'Use recommended': 'Empfehlung übernehmen',
  'Model for {task}': 'Modell für {task}',
  'Same as main': 'Wie Hauptmodell',
  'Same as main ({model})': 'Wie Hauptmodell ({model})',
  'suggested': 'empfohlen',
  'Every task uses the main model ({model}).': 'Jede Aufgabe läuft auf dem Hauptmodell ({model}).',
  '{n} of {total} tasks have their own model.': '{n} von {total} Aufgaben haben ein eigenes Modell.',
  "Chosen by the app's admin for everyone. This is the model each task runs on.":
    'Vom Admin der App für alle festgelegt. Auf diesem Modell läuft die jeweilige Aufgabe.',
  'AI model per task': 'KI-Modell pro Aufgabe',
  "Today's AI usage": 'KI-Nutzung heute',
  'Refresh': 'Aktualisieren',
  '/ {limit} calls': '/ {limit} Aufrufen',
  '{n} remaining': 'noch {n}',
  'Resets daily at midnight UTC.': 'Wird täglich um Mitternacht (UTC) zurückgesetzt.',
  'No usage data yet.': 'Noch keine Nutzungsdaten.',
  'Saving...': 'Speichert…',
  'Save Settings': 'Einstellungen speichern',
  'You must be signed in to save settings.': 'Du musst angemeldet sein, um Einstellungen zu speichern.',
  'Failed to save settings: {message}': 'Die Einstellungen konnten nicht gespeichert werden: {message}',
  'Failed to save the AI models: {message}': 'Die KI-Modelle konnten nicht gespeichert werden: {message}',
  'Settings saved!': 'Einstellungen gespeichert!',

  // ── Connections ────────────────────────────────────────────────────────────
  'Name for {email}': 'Name für {email}',
  'Rename {name}': '{name} umbenennen',
  'Set a name': 'Namen vergeben',
  'Connected accounts': 'Verknüpfte Konten',
  'Connecting lets you both browse each other’s recipes and save copies. It shares your <b>whole recipe collection</b>, not selected recipes, until you disconnect. Neither of you can edit the other’s recipes.':
    'Mit einer Verknüpfung könnt ihr beide die Rezepte des anderen ansehen und Kopien speichern. Geteilt wird deine <b>gesamte Rezeptsammlung</b>, nicht einzelne Rezepte, bis du die Verknüpfung trennst. Bearbeiten könnt ihr die Rezepte des anderen nicht.',
  'their@email.com': 'name@beispiel.de',
  'Email address to connect with': 'E-Mail-Adresse, mit der du dich verknüpfen möchtest',
  'Invite': 'Einladen',
  'Invitations for you': 'Einladungen für dich',
  'Decline invitation from {name}': 'Einladung von {name} ablehnen',
  'Connected': 'Verknüpft',
  'Disconnect': 'Trennen',
  'Waiting for them to accept': 'Warten auf Annahme',
  'No connections yet. Invite someone you cook with.': 'Noch keine Verknüpfungen. Lade jemanden ein, mit dem du kochst.',
  'Could not load your connections.': 'Deine Verknüpfungen konnten nicht geladen werden.',
  'You cannot connect to yourself.': 'Du kannst dich nicht mit dir selbst verknüpfen.',
  'You have already invited that person.': 'Diese Person hast du schon eingeladen.',
  'Invitation sent to {email}': 'Einladung an {email} gesendet',
  'Could not send the invitation.': 'Die Einladung konnte nicht gesendet werden.',
  'Connected — you can now see each other’s recipes.': 'Verknüpft: Ihr seht jetzt die Rezepte des anderen.',
  'Could not accept the invitation.': 'Die Einladung konnte nicht angenommen werden.',
  'Could not disconnect. Please reload and try again.':
    'Die Verknüpfung konnte nicht getrennt werden. Bitte lade neu und versuch es noch einmal.',
  'Disconnected': 'Verknüpfung getrennt',
  'Could not disconnect.': 'Die Verknüpfung konnte nicht getrennt werden.',
  'Could not save the name.': 'Der Name konnte nicht gespeichert werden.',

  // ── Usage: the person's own AI calls (GeminiLogs, ReasoningTag) ────────────
  '{n}s ago': 'vor {n} s',
  '{n}m ago': 'vor {n} min',
  '{n}h ago': 'vor {n} h',
  '<b>{n}</b> calls': '<b>{n}</b> Aufrufe',
  '<b>{rate}%</b> success': '<b>{rate} %</b> erfolgreich',
  '<b>{time}</b> avg': '<b>{time}</b> im Schnitt',
  'No API calls yet. Extract a recipe to see logs here.':
    'Noch keine KI-Aufrufe. Lies ein Rezept ein, dann erscheinen sie hier.',
  'Time': 'Zeit',
  'Endpoint': 'Endpunkt',
  'Model': 'Modell',
  'Status': 'Status',
  '{model} resolved to {version}': '{model} lief als {version}',
  'Succeeded': 'Erfolgreich',
  'Failed': 'Fehlgeschlagen',
  'Reasoning': 'Reasoning',
  'Input Prompt': 'Eingabe (Prompt)',
  'Output Response': 'Ausgabe (Antwort)',
  'Error': 'Fehler',
  'on##reasoning': 'an',
  'off##reasoning': 'aus',
  'minimal##reasoning': 'minimal',
  'low##reasoning': 'niedrig',
  'refused##reasoning': 'verweigert',
  'Ran with reasoning': 'Lief mit Reasoning',
  'Ran without reasoning, as configured for this task': 'Lief ohne Reasoning, wie für diese Aufgabe eingestellt',
  'Ran at the lowest reasoning level, minimal. From Gemini 3 on, reasoning can be lowered but not switched off':
    'Lief auf der niedrigsten Reasoning-Stufe, minimal. Ab Gemini 3 lässt sich Reasoning nur senken, nicht abschalten',
  'Ran at low reasoning, the lowest this model offers':
    'Lief mit niedrigem Reasoning, der niedrigsten Stufe, die dieses Modell bietet',
  'Reasoning was meant to be lowered, but this model refused every lower setting, so it ran at its default':
    'Das Reasoning sollte gesenkt werden, aber das Modell hat jede niedrigere Stufe verweigert und lief deshalb mit seiner Voreinstellung',
  'Not recorded for this call': 'Für diesen Aufruf nicht aufgezeichnet',

  // ── iPhone Shortcuts ───────────────────────────────────────────────────────
  'iPhone Shortcuts': 'iPhone-Kurzbefehle',
  'Copy address': 'Adresse kopieren',
  "Two Shortcuts put Speisekammer in your iPhone's share sheet: one for pictures in the Photos app, one for pages and links from Safari, Instagram or any other app. Recipes are saved right away and marked as new here. Both use the same key.":
    'Zwei Kurzbefehle bringen Speisekammer ins Teilen-Menü deines iPhones: einer für Bilder in der Fotos-App, einer für Seiten und Links aus Safari, Instagram oder jeder anderen App. Rezepte werden sofort gespeichert und hier als neu markiert. Beide nutzen denselben Schlüssel.',
  'Checking…': 'Wird geprüft…',
  'No key yet. The Shortcuts need one to send recipes to your vault.':
    'Noch kein Schlüssel. Die Kurzbefehle brauchen einen, um Rezepte in deinen Vault zu senden.',
  'Create key': 'Schlüssel erstellen',
  'Key made {made}, last used {used}.': 'Schlüssel erstellt am {made}, zuletzt verwendet am {used}.',
  'Key made {made}, not used yet.': 'Schlüssel erstellt am {made}, noch nicht verwendet.',
  'Make a new key? The old one stops working at once, so the Shortcuts need the new one.':
    'Neuen Schlüssel erstellen? Der alte funktioniert dann sofort nicht mehr, die Kurzbefehle brauchen also den neuen.',
  'New key': 'Neuer Schlüssel',
  'Remove the key? The Shortcuts will stop working until you make a new one.':
    'Schlüssel entfernen? Die Kurzbefehle funktionieren dann nicht mehr, bis du einen neuen erstellst.',
  'Remove key': 'Schlüssel entfernen',
  'Your key: copy it now. It is shown only this once.': 'Dein Schlüssel: Kopier ihn jetzt. Er wird nur dieses eine Mal angezeigt.',
  'Anyone with this key can add recipes to your vault (nothing else). If it gets out, make a new one.':
    'Wer diesen Schlüssel hat, kann Rezepte in deinen Vault legen (sonst nichts). Gerät er in fremde Hände, erstell einen neuen.',
  'Could not check the Shortcut key.': 'Der Schlüssel konnte nicht geprüft werden.',
  'The key could not be made. Please try again.': 'Der Schlüssel konnte nicht erstellt werden. Bitte versuch es noch einmal.',
  'The key could not be removed. Please try again.': 'Der Schlüssel konnte nicht entfernt werden. Bitte versuch es noch einmal.',
  'The link could not be saved.': 'Der Link konnte nicht gespeichert werden.',
  'From the Photos app': 'Aus der Fotos-App',
  'Select one or more pictures, tap Share, then <b>{name}</b>. Several pages become one recipe.':
    'Wähle ein oder mehrere Bilder aus, tippe auf Teilen und dann auf <b>{name}</b>. Mehrere Seiten werden zu einem Rezept.',
  'Shared Shortcut link': 'Link zum geteilten Kurzbefehl',
  'Shared Safari Shortcut link': 'Link zum geteilten Safari-Kurzbefehl',
  '{label} (admin)': '{label} (Admin)',
  'In the <b>Shortcuts</b> app, tap <b>+</b> and name the shortcut <b>{name}</b>.':
    'Tippe in der App <b>Kurzbefehle</b> auf <b>+</b> und nenne den Kurzbefehl <b>{name}</b>.',
  'Open its details (ⓘ), turn on <b>Show in Share Sheet</b>, and let it receive <b>Images</b> only.':
    'Öffne seine Details (ⓘ), schalte <b>Im Share-Sheet anzeigen</b> ein und lass ihn nur <b>Bilder</b> empfangen.',
  'Add <b>Count</b> (items in Shortcut Input), then <b>If</b> Count is greater than 1: <b>Choose from Menu</b> with “One recipe (several pages)” → <b>Text</b> <code>single</code>, and “One recipe per picture” → <b>Text</b> <code>each</code>. Otherwise: <b>Text</b> <code>single</code>. After the If, add <b>Set Variable</b> <i>Mode</i> to the If Result.':
    'Füge <b>Anzahl</b> hinzu (Objekte in der Kurzbefehleingabe), dann <b>Wenn</b> Anzahl größer als 1 ist: <b>Aus Menü auswählen</b> mit „Ein Rezept (mehrere Seiten)“ → <b>Text</b> <code>single</code> und „Ein Rezept pro Bild“ → <b>Text</b> <code>each</code>. Sonst: <b>Text</b> <code>single</code>. Füge nach dem Wenn <b>Variable festlegen</b> hinzu: <i>Mode</i> auf das Wenn-Ergebnis.',
  'Add <b>Repeat with Each</b> item in Shortcut Input, and inside it: <b>Resize Image</b> to width 1280 (height automatic), <b>Convert Image</b> to JPEG (quality about 70%, keep metadata on), <b>Base64 Encode</b> with Line Breaks set to <b>None</b>.':
    'Füge <b>Wiederholen mit jedem</b> Objekt in der Kurzbefehleingabe hinzu und darin: <b>Bildgröße ändern</b> auf Breite 1280 (Höhe automatisch), <b>Bild konvertieren</b> in JPEG (Qualität etwa 70 %, Metadaten beibehalten an), <b>Base64-codieren</b> mit Zeilenumbrüche auf <b>Ohne</b>.',
  'After the repeat, add <b>Get Contents of URL</b> with the address above, Method <b>POST</b>, a header <code>X-Speisekammer-Key</code> with your key, and Request Body <b>JSON</b> with <code>images</code> = Repeat Results and <code>mode</code> = <i>Mode</i>.':
    'Füge nach der Wiederholung <b>Inhalte von URL abrufen</b> hinzu: mit der Adresse oben, Methode <b>POST</b>, einem Header <code>X-Speisekammer-Key</code> mit deinem Schlüssel und Haupttext anfordern <b>JSON</b> mit <code>images</code> = Wiederholungsergebnisse und <code>mode</code> = <i>Mode</i>.',
  'Add <b>Get Dictionary Value</b> for <code>message</code>, then <b>Show Notification</b> with it.':
    'Füge <b>Wörterbuchwert abrufen</b> für <code>message</code> hinzu, dann <b>Mitteilung anzeigen</b> mit diesem Wert.',
  'Up to 8 pictures at a time. The notification says “Got it” as soon as they have arrived; the recipe appears here about a minute later, marked New.':
    'Bis zu 8 Bilder auf einmal. Die Mitteilung meldet den Empfang, sobald sie angekommen sind; das Rezept erscheint etwa eine Minute später hier, als neu markiert.',
  'From Safari, Instagram and other apps': 'Aus Safari, Instagram und anderen Apps',
  "In Safari, tap Share, then <b>{name}</b>: it reads the page you have open, so sites that block the link import (REWE, EDEKA) work too. On an Instagram post or reel, or a link in any other app, the same Shortcut sends the link; a post's recipe is read from its caption, and one that is only in the video cannot be read.":
    'Tippe in Safari auf Teilen und dann auf <b>{name}</b>: Der Kurzbefehl liest die Seite, die du geöffnet hast. So klappen auch Seiten, die den Import per Link blockieren (REWE, EDEKA). Bei einem Instagram-Beitrag oder -Reel oder einem Link in einer anderen App sendet derselbe Kurzbefehl den Link; das Rezept eines Beitrags wird aus der Bildunterschrift gelesen, eines, das nur im Video vorkommt, lässt sich nicht lesen.',
  'Once on each iPhone: <b>Settings → Apps → Shortcuts → Advanced</b>, turn on <b>Allow Running Scripts</b>. The Shortcut reads the page you have open in Safari, so it needs that. If it asks to run on a site, allow it.':
    'Einmal pro iPhone: unter <b>Einstellungen → Apps → Kurzbefehle → Erweitert</b> die Option <b>Ausführen von Skripten erlauben</b> einschalten. Der Kurzbefehl liest die Seite, die du in Safari geöffnet hast, und braucht das dafür. Fragt er, ob er auf einer Seite laufen darf, erlaube es.',
  'Open its details (ⓘ), turn on <b>Show in Share Sheet</b>, and let it receive <b>Safari web pages</b> and <b>URLs</b>.':
    'Öffne seine Details (ⓘ), schalte <b>Im Share-Sheet anzeigen</b> ein und lass ihn <b>Safari-Webseiten</b> und <b>URLs</b> empfangen.',
  'Add <b>Get Type</b> of Shortcut Input, then <b>If</b> Type <b>is</b> <code>Safari web page</code>. (The text can differ by language: put <b>Show Result</b> after Get Type once, share a page from Safari, and use what it shows.)':
    'Füge <b>Typ abrufen</b> für die Kurzbefehleingabe hinzu, dann <b>Wenn</b> Typ <b>ist</b> <code>Safari-Webseite</code>. (Der Text kann je nach Sprache anders lauten: Setz einmal <b>Ergebnis einblenden</b> hinter Typ abrufen, teile eine Seite aus Safari und nimm, was dort steht.)',
  'Inside the If: <b>Run JavaScript on Web Page</b> (on Shortcut Input), with this script in place of its own:':
    'Im Wenn: <b>JavaScript auf Webseite ausführen</b> (auf der Kurzbefehleingabe), mit diesem Skript anstelle des vorgegebenen:',
  'Copy script': 'Skript kopieren',
  'then <b>Get Contents of URL</b> with the address above, Method <b>POST</b>, a header <code>X-Speisekammer-Key</code> with your key, and Request Body <b>JSON</b> with <code>page</code> = JavaScript Result (as Text).':
    'dann <b>Inhalte von URL abrufen</b> mit der Adresse oben, Methode <b>POST</b>, einem Header <code>X-Speisekammer-Key</code> mit deinem Schlüssel und Haupttext anfordern <b>JSON</b> mit <code>page</code> = JavaScript-Ergebnis (als Text).',
  'Under <b>Otherwise</b>: <b>Get Contents of URL</b> with the same address, method and header, and Request Body <b>JSON</b> with <code>url</code> = Shortcut Input.':
    'Unter <b>Sonst</b>: <b>Inhalte von URL abrufen</b> mit derselben Adresse, Methode und demselben Header und Haupttext anfordern <b>JSON</b> mit <code>url</code> = Kurzbefehleingabe.',
  'After <b>End If</b>: <b>Get Dictionary Value</b> for <code>message</code> in the <b>If Result</b>, then <b>Show Notification</b> with it. Not in <i>Contents of URL</i>: that names one of the two requests, and is empty whenever the other one ran, so the notification would come up blank.':
    'Nach <b>Ende von „Wenn“</b>: <b>Wörterbuchwert abrufen</b> für <code>message</code> im <b>Wenn-Ergebnis</b>, dann <b>Mitteilung anzeigen</b> mit diesem Wert. Nicht in <i>Inhalt der URL</i>: Das meint nur eine der beiden Anfragen und ist leer, wenn die andere lief, die Mitteilung bliebe dann leer.',
  "The first time, the Shortcut may be under <b>More</b> at the end of the share sheet's app row, or in its list of actions; <b>Edit Actions</b> there puts it among the favourites. Private Instagram posts come back with a notification saying so: open those in Safari and share from there.":
    'Beim ersten Mal steht der Kurzbefehl vielleicht unter <b>Mehr</b> am Ende der App-Reihe im Teilen-Menü oder in dessen Aktionsliste; mit <b>Aktionen bearbeiten</b> kommt er dort zu den Favoriten. Bei privaten Instagram-Beiträgen sagt dir das eine Mitteilung: Öffne sie in Safari und teile von dort.',
  'Under <b>Headers</b>, delete every empty row (the grey <i>Key / Text</i> placeholders) with the red minus. Shortcuts sends them as headers without a name, and the request then fails with “The network connection was lost”.':
    'Lösch unter <b>Header</b> jede leere Zeile (die grauen Platzhalter <i>Schlüssel / Text</i>) mit dem roten Minus. Kurzbefehle sendet sie als Header ohne Namen, und die Anfrage scheitert dann mit „Die Netzwerkverbindung wurde unterbrochen“.',
  'Add to Shortcuts': 'Zu Kurzbefehle hinzufügen',
  'Opens the Shortcuts app with <b>{name}</b>. When it asks for the key, paste the one from above.':
    'Öffnet die App Kurzbefehle mit <b>{name}</b>. Wenn sie nach dem Schlüssel fragt, füg den von oben ein.',
  'Build the Shortcut once with the steps below, with your key in a <b>Text</b> action at the top and that Text used in the header. Then <b>ⓘ</b> → <b>Setup</b> → <b>Add New Question</b> and pick that Text action, so each person is asked for their own key (Apple clears yours when you share). Then <b>Share</b> → <b>Copy iCloud Link</b> and paste it here. It is saved at once, and everyone gets the Add to Shortcuts button.':
    'Bau den Kurzbefehl einmal nach den Schritten unten, mit deinem Schlüssel in einer <b>Text</b>-Aktion ganz oben und diesem Text im Header. Dann <b>ⓘ</b> → <b>Konfiguration</b> → <b>Neue Frage hinzufügen</b> und diese Text-Aktion wählen, damit jede Person nach ihrem eigenen Schlüssel gefragt wird (Apple entfernt deinen beim Teilen). Dann <b>Teilen</b> → <b>iCloud-Link kopieren</b> und hier einfügen. Er wird sofort gespeichert, und alle bekommen die Taste „Zu Kurzbefehle hinzufügen“.',
  'Remove link': 'Link entfernen',
  'Save link': 'Link speichern',
  'Saved. Everyone sees Add to Shortcuts for this one.': 'Gespeichert. Alle sehen dafür jetzt „Zu Kurzbefehle hinzufügen“.',
  'No iCloud link found in that. In Shortcuts: open the Shortcut, <b>Share</b> → <b>Copy iCloud Link</b>, then paste here.':
    'Darin steckt kein iCloud-Link. In Kurzbefehle: Kurzbefehl öffnen, <b>Teilen</b> → <b>iCloud-Link kopieren</b>, dann hier einfügen.',
  'Build the Shortcut yourself instead': 'Den Kurzbefehl stattdessen selbst bauen',
  'How to set up the Shortcut (once, about 5 minutes)': 'So richtest du den Kurzbefehl ein (einmalig, etwa 5 Minuten)',

  // ── Feedback ───────────────────────────────────────────────────────────────
  'Thank you! Your feedback was sent.': 'Danke! Dein Feedback wurde gesendet.',
  'A fault, an idea, anything. It goes to the person who runs Speisekammer.':
    'Ein Fehler, eine Idee, was auch immer. Es geht an die Person, die Speisekammer betreibt.',
  'What is it about?': 'Worum geht es?',
  'What happened, and what did you expect?': 'Was ist passiert, und was hattest du erwartet?',
  'Your message': 'Deine Nachricht',
  'Sent along with it': 'Wird mitgesendet',
  'None of your recipes are attached.': 'Keines deiner Rezepte wird angehängt.',
  'Something is broken': 'Etwas funktioniert nicht',
  'An idea': 'Eine Idee',
  'Something else': 'Etwas anderes',
  'App version': 'App-Version',
  'Where you are': 'Wo du bist',
  'Screen': 'Bildschirm',
  'dark': 'dunkel',
  'light': 'hell',
  'installed app': 'installierte App',
  'browser': 'Browser',
  'Device': 'Gerät',
  'Last error': 'Letzter Fehler',
  'Please write a few words first.': 'Schreib bitte erst ein paar Worte.',
  'Please keep it under {max} characters.': 'Bitte bleib unter {max} Zeichen.',
  'That is a lot of feedback for one day. Please send the rest tomorrow.':
    'Das ist viel Feedback für einen Tag. Bitte schick den Rest morgen.',
  'The feedback could not be sent. Please try again in a moment.':
    'Das Feedback konnte nicht gesendet werden. Bitte versuch es gleich noch einmal.',

  // ── When the app cannot draw itself (LoadFailure, ErrorBoundary) ───────────
  'Updating…': 'Wird aktualisiert…',
  'Part of {app} could not be loaded': 'Ein Teil von {app} konnte nicht geladen werden',
  '{app} ran into a problem': 'Bei {app} ist ein Problem aufgetreten',
  'A file the app needs did not arrive. Reloading usually fixes this after an update. If it keeps happening in this browser only, something in the browser is holding on to an old copy or stopping the file: try the reset below.':
    'Eine Datei, die die App braucht, ist nicht angekommen. Nach einem Update hilft meist neu laden. Passiert es nur in diesem Browser immer wieder, hält etwas im Browser eine alte Kopie fest oder blockiert die Datei: Probier dann das Zurücksetzen unten.',
  'Something went wrong while showing this page. Reloading usually helps.':
    'Beim Anzeigen dieser Seite ist etwas schiefgegangen. Neu laden hilft meistens.',
  'Resetting…': 'Wird zurückgesetzt…',
  'Reset saved app files and reload': 'Gespeicherte App-Dateien zurücksetzen und neu laden',
  'Your recipes are not affected. Details: {details}': 'Deine Rezepte sind nicht betroffen. Details: {details}',
  'unknown error': 'unbekannter Fehler',
  'Reported. Thank you.': 'Gemeldet. Danke.',
  'The report could not be sent from here.': 'Die Meldung konnte von hier aus nicht gesendet werden.',
  'Reporting…': 'Wird gemeldet…',
  'Report this problem': 'Dieses Problem melden',
  'Something went wrong displaying this recipe.': 'Beim Anzeigen dieses Rezepts ist etwas schiefgegangen.',
};

export default account;
