/**
 * What's new, newest first.
 *
 * Lives in the codebase rather than the database so an entry ships in the same
 * commit as the change it describes — a release note that can drift from what
 * was actually deployed is worse than none.
 *
 * `id` is the release date and must stay sortable as a plain string: "seen" is
 * stored as the newest id the reader has acknowledged, and anything greater is
 * unread. Never reuse or re-order ids.
 *
 * Titles and items are English and marked with msg(); WhatsNew translates
 * them where they are shown (German in src/i18n/de/admin.ts).
 */
import { msg } from '@/i18n';

export interface ReleaseNote {
  /** YYYY-MM-DD. Sorted and compared as a string. */
  id: string;
  title: string;
  /** Written for someone who uses the app, not someone who reads the diff. */
  items: string[];
}

export const RELEASES: ReleaseNote[] = [
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-19',
    title: msg('A calmer top bar, and everything about you in one place'),
    items: [
      msg('On a phone, your account is now the last tab at the bottom (“You”). Settings, dark mode, What’s new, feedback and sign-out are all there, so the top bar keeps just Suggest and Add recipe. On a computer the same list opens from your avatar.'),
      msg('You can set your name (You → Your name). Your avatar then shows your initials instead of the first letter of your email address.'),
      msg('Filters: one “Filters” button shows every tag at once, by group. What you choose appears beside it and can be removed with ✕. “Shared” moved to the end of the row.'),
      msg('Collections sit on one line. “+” adds one, and “Edit” lets you rename or delete them, which was not possible on a phone before. Deleting asks first and never deletes recipes.'),
      msg('A recipe can start a new collection right from its own page.'),
      msg('The sort order is a small button beside the search, which gives the search field the room.'),
      msg('“What can I cook?” has been redrawn to match the rest of the app.'),
      msg('Exporting your recipes now asks before it downloads.'),
    ],
  },
  {
    id: '2026-12-18',
    title: msg('Better search, a screen that stays on, and a way to tell us'),
    items: [
      msg('Search finds more: “Kartoffel” now finds “Kartoffeln” and “Kartoffelsuppe”, “Suppe” finds “Kartoffelsuppe”, and results appear while you are still typing a word. Several words work together, and tags are searched too.'),
      msg('In cook mode the screen stays on, so the phone no longer dims and locks while your hands are busy. (In low power mode the phone may still decide otherwise.)'),
      msg('Shopping list: you can add your own items at the top, and “Generate” now keeps them. It used to replace the whole list.'),
      msg('Send feedback: the account menu has a new entry for reporting a fault or sending an idea.'),
      msg('“Save as new recipe” after AI Scale is gone. It did not work, and scaling the same recipe again costs nothing extra.'),
      msg('Speisekammer is by invitation for now, and the sign-in screen says what happens to your data.'),
      msg('After signing in, your recipes are there at once. The vault used to look empty until you tapped a filter or searched.'),
    ],
  },
  {
    id: '2026-12-17',
    title: msg('The top bar fits the screen'),
    items: [
      msg('On phones 360 pixels wide, many Android phones among them, the bar at the top no longer runs past the edge of the screen, so the page no longer slides sideways when you swipe.'),
      msg('On phones its buttons sit a little closer together, and on the narrowest ones the app’s name is a little smaller.'),
      msg('On a computer, the buttons at the top no longer stick out past the right edge of the page. To make room for the tabs, Suggest is now a round wand button there, as on a phone.'),
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-16',
    title: msg('Privacy and safety fixes'),
    items: [
      msg('Photos you send from your iPhone are now stored without their hidden details, such as where they were taken.'),
      msg('Signing out now removes the offline copy of your recipes from this device, so the next person to use it cannot see them.'),
      msg('Declining an invitation to connect accounts now really declines it. It used to stay in your inbox.'),
      msg('Connecting accounts now needs a confirmed email address, and recipes sent to you can only be accepted from one.'),
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-15',
    title: msg('Password reset fixed'),
    items: [
      msg('The link in a “reset your password” email now asks for a new password, as it should. It used to sign you straight in without letting you set one.'),
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-14',
    title: msg('One Shortcut for pages and links'),
    items: [
      msg('The Safari Shortcut now takes links from Instagram and other apps too, so one entry in the share sheet does both: in Safari it reads the page you have open, anywhere else it sends the link.'),
      msg('The separate “Send link to Speisekammer” Shortcut is no longer needed, and it appeared in Safari as well. The steps for the combined one are under Settings → iPhone Shortcuts.'),
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-13',
    title: msg('Tidier Settings'),
    items: [
      msg('The tabs in Settings fit on one row of a phone, and the AI models have a tab of their own instead of sitting at the end of General.'),
      msg('The tabs in Settings and on the admin dashboard look like the app’s main tab bar, and work with the arrow keys.'),
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-12',
    title: msg('Recipes from Instagram'),
    items: [
      msg('A third iPhone Shortcut, “Send link to Speisekammer”: on an Instagram post or reel, tap Share and send it. The recipe is read from the post’s caption. Set it up under Settings → iPhone Shortcuts. Links from other apps work too.'),
      msg('An Instagram link pasted into Add recipe → Website works the same way.'),
      msg('Recipes from Instagram keep their photo. Instagram’s picture links stop working after a few days, so Speisekammer now keeps its own copy.'),
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-11',
    title: msg('Ingredients in cook mode'),
    items: [
      msg('Cook mode shows the ingredients each step needs right under it, with amounts. Tap one to tick it off.'),
      msg('The full list has its own Ingredients button. On a phone it slides up from the bottom, so the step stays in view.'),
      msg('The delete confirmation has bigger buttons.'),
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-10',
    title: msg('The iPhone Shortcuts answer at once'),
    items: [
      msg('Sending a picture or a Safari page now says “Got it” as soon as it has arrived, instead of waiting while the recipe is read. The recipe appears in the vault about a minute later, marked New.'),
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-09',
    title: msg('Filter by more, and combine filters'),
    items: [
      msg('Above the vault: Diet, Cuisine, Meal, Main ingredient and More each open a menu, so every tag can be filtered by. Pick from several to combine them, for example Vegetarian and Italian.'),
      msg('New tags: German, Chicken, Meat, Fish & Seafood, Pasta, Salad, Casserole and Meal Prep. New recipes get them automatically; for an older one, use ⋯ → Regenerate tags.'),
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-08',
    title: msg('A calmer way to add recipes'),
    items: [
      msg('Adding a recipe starts with a choice: from a website, photos, a PDF or text, or Enter it manually for the full editor.'),
      msg('While a recipe is read, the key opens the vault and puts it in. No more second message in the corner.'),
      msg('Filters and tags have a cleaner look, with icons instead of emoji, and the ingredients on each card are a simple list.'),
      msg('The key now shows in the browser tab.'),
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-07',
    title: msg('Save recipes straight from Safari'),
    items: [
      msg('A second iPhone Shortcut, Save page to Speisekammer: open a recipe in Safari, tap Share and it is saved with its link. It works for sites like REWE and EDEKA that block the link import.'),
      msg('Set it up under Settings → iPhone Shortcuts. It uses the same key as the Photos Shortcut, and needs Allow Running Scripts turned on once in the Shortcuts settings.'),
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-06',
    title: msg('When a website will not share its recipe'),
    items: [
      msg('Some sites, REWE and EDEKA among them, block apps from reading their pages. Instead of "Forbidden" you now see which site it is and three ways that work: paste the text, save the page as a PDF, or use screenshots. The link stays with the recipe.'),
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-05',
    title: msg('Add the iPhone Shortcut with one tap'),
    items: [
      msg('Settings → iPhone Shortcut now has an Add to Shortcuts button. Make your key, copy it, tap the button, and paste the key when the Shortcuts app asks for it. No need to build the Shortcut yourself any more.'),
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-04',
    title: msg('Send recipes straight from your photos'),
    items: [
      msg('With an iPhone Shortcut you can now send recipes from the Photos app: select one or more pictures, tap Share, then Send to Speisekammer. Several pages become one recipe, or one recipe per picture if you prefer. Set it up once under Settings → iPhone Shortcut.'),
      msg('Recipes sent this way are saved straight away. The next time you open the app a banner shows what arrived, each new recipe carries a New badge until you open it, and anything that could not be read is listed with the reason.'),
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-03',
    title: msg('Claude does the AI work now, with Gemini standing by'),
    items: [
      msg('Reading recipes from photos, PDFs and web pages, translating, tagging, nutrition and the rest now run on Anthropic\'s Claude.'),
      msg('Photos you take of a cookbook page or a handwritten card go to Claude\'s strongest model, which reads curved pages and handwriting best. Screenshots are recognised (by what the camera records in a photo, and by the shape of a phone screen) and read by the faster model, since their text is already clean.'),
      msg('Google\'s Gemini stays ready behind it: if Claude is busy or unavailable, the same request goes to Gemini straight away, so a problem at one of them no longer stops the app.'),
    ],
  },
  {
    // Ids are compared as strings and must increase with each release, not
    // follow the calendar: an earlier one would count as already read.
    id: '2026-12-02',
    title: msg('One set of AI models for everyone'),
    items: [
      msg('The AI models are now chosen once, for everyone, by the app\'s admin. Choosing your own could put a task on a model this app has no allowance for, and then every call to it failed.'),
      msg('Settings still shows which model each task runs on, and what it actually ran as on your recent calls.'),
    ],
  },
  {
    // After 2026-11-30, not today's date: ids are compared as strings, and an
    // earlier one would count as already read for anyone who saw that release.
    id: '2026-12-01',
    title: msg('Fewer failed imports when Gemini is busy'),
    items: [
      msg('Importing a recipe from a photo or a PDF now waits and tries again when the AI model is busy, as every other AI feature already did. Before, a single busy moment made the import fail straight away.'),
      msg('If the chosen model stays busy or has used up its daily allowance, the app now asks the other model instead of giving up. This works for every AI feature.'),
    ],
  },
  {
    id: '2026-11-30',
    title: msg('Tags, nutrition and translations on the Lite model'),
    items: [
      msg('If you chose the Lite model for tagging, nutrition or translation, those failed every time: the app asked the model to switch its reasoning off in a way newer Gemini models no longer accept. It now asks each model for the lowest reasoning it offers, and falls back to its default if it refuses.'),
    ],
  },
  {
    id: '2026-11-29',
    title: msg('Fixed for iPhone, and clearer recipe cards'),
    items: [
      msg('On an iPhone the header sat behind the clock and the camera, where a tap goes to the phone instead of the app. That is why its buttons did nothing and looked blurred. It now starts just below them, and so do the close buttons of a recipe, cook mode and the photo viewer, and the notices that pop up. The buttons at the foot of cook mode no longer sit on the home bar.'),
      msg('The header is also more solid, so a photo scrolling underneath no longer smears behind its buttons.'),
      msg('Each recipe now has a fine edge and a soft shadow, with more room between them, so it is clear where one recipe ends and the next begins.'),
    ],
  },
  {
    id: '2026-11-28',
    title: msg('A new look: glass'),
    items: [
      msg('The tab bar now floats over the page as a glass capsule, and a tinted pill slides to the tab you choose. On a phone the page runs out softly beneath it. The header, the dropdown menus and the small round buttons that sit on photos are glass too.'),
      msg('Everything you can tap now answers: it fades the moment you touch it and recovers when you let go. Buttons and filters also give a little, and the main green buttons get darker instead of paler.'),
      msg('If your device is set to reduce transparency, the glass becomes solid. If it is set to reduce motion, nothing slides or springs; a tap is still acknowledged by the change in colour.'),
    ],
  },
  {
    id: '2026-11-27',
    title: msg('Translating no longer gets stuck'),
    items: [
      msg('Opening a recipe could start a translation by itself and lock every language until it finished. A translation now only starts when you choose a language, and while it is being made you can still pick any other language, or the original, to stop it.'),
      msg('A translation that fails, or that you delete, no longer leaves the recipe set to a language it has no text for.'),
      msg('While you are reading a translation, the language picker now offers "Delete this translation" right there. The menu behind the three dots still lists every stored translation.'),
    ],
  },
  {
    id: '2026-11-26',
    title: msg('Deleting a translation really deletes it'),
    items: [
      msg('Deleting a translation removed the tick but not the translation: choosing the language again showed the same text as before, and no new one was made until you reloaded the app. A deleted translation is now gone, and choosing the language again makes a fresh one.'),
      msg('The language picker is tidier. The small crosses on the languages are gone; deleting a translation is rare, so it has moved into the menu behind the three dots.'),
    ],
  },
  {
    id: '2026-11-25',
    title: msg('Sending a recipe keeps it open'),
    items: [
      msg('When you send a recipe to a friend, the recipe now stays open behind the email form. Before, it closed as soon as the form appeared, so after sending or cancelling you were back in the vault and had to find the recipe again.'),
    ],
  },
  {
    id: '2026-11-24',
    title: msg('Translations keep their steps'),
    items: [
      msg('A translated recipe could come back with several steps run together into one point. Each step is now translated on its own, and a translation whose number of steps does not match the recipe is thrown away and asked for again instead of being saved.'),
      msg('A translation saved before this fix stays as it is. To correct one, open the language menu on that recipe, delete the language, and choose it again.'),
    ],
  },
  {
    id: '2026-11-23',
    title: msg('Fix for a page that kept reloading'),
    items: [
      msg('On some browsers the app could reload itself over and over, flickering and impossible to use. That was a fault in an earlier fix: when a part of the app would not load, it reloaded the page to recover — and then did so again on every reload. It now reloads once at most.'),
      msg('If part of the app still cannot be loaded after that, you now get a message that says so, with a button to reload and one to reset the saved app files, instead of a blank or flickering page.'),
    ],
  },
  {
    id: '2026-11-22',
    title: msg('Paste a recipe as text'),
    items: [
      msg('Adding a recipe has a fourth way in: Text. Paste a recipe from a chat message, a note or another app — ingredients and steps in any order — and it is sorted into the form for you to check, in the language it was written in.'),
      msg('If what you pasted turns out not to be a recipe, you are told so instead of getting an invented one, and your text stays in the box.'),
    ],
  },
  {
    id: '2026-11-21',
    title: msg('Translations that come out wrong are no longer kept'),
    items: [
      msg('A translation could come back with stray text from the AI in the middle of the title, and was saved like that — so the recipe stayed broken in that language until you deleted it. Such a result is now thrown away and asked for again, and if the second try is no better you get a message instead of a damaged recipe.'),
      msg('Tags and nutrition appear sooner after you save a recipe.'),
    ],
  },
  {
    id: '2026-11-20',
    title: msg('Fixes for a blank page and for deleting translations'),
    items: [
      msg('After an update, the app could open as a blank white page on a device that still had the previous version cached — it now notices and reloads itself once.'),
      msg('A translation of the recipe’s own original language could not be deleted, which was exactly the one you would want to remove when it came out wrong.'),
    ],
  },
  {
    id: '2026-11-19',
    title: msg('Better shared links, and a fix for translation'),
    items: [
      msg('Translating a recipe from a connected account used to fail outright. It now works — the check behind it was asking whether you owned the recipe rather than whether you could see it.'),
      msg('A shared link pasted into WhatsApp, Slack or a message now shows the recipe’s name and photo instead of a bare address. Shared recipes are kept out of search engines.'),
      msg('Guests can now see all of a recipe’s photos, its nutrition, switch between any languages you had already translated it into, and flip between °C and °F.'),
      msg('Saving a shared recipe as a PDF now names the file after the recipe.'),
      msg('Recipes with a live public link are marked in your vault, and there is a new "Shared" filter to see them all at once.'),
      msg('Polish is no longer offered as a translation language.'),
      msg('The language picker now ticks the languages a recipe has already been translated into — those open instantly and cost nothing — and lets you delete any of them you no longer want.'),
      msg('The options menu behind the three dots no longer runs off the side of the screen on a narrow phone, where half its labels used to be cut off.'),
      msg('Added to your home screen, the app now shows its own key symbol on the deep green of the app itself — and is called Speisekammer, not the old name it had kept there.'),
    ],
  },
  {
    id: '2026-11-18',
    title: msg('Share a recipe with someone who has no account'),
    items: [
      msg('Open a recipe, choose "Create public link", and send it to anyone — they can read the whole recipe without signing up or installing anything.'),
      msg('They can change the servings and the amounts follow, step through cook mode with its timers, and print or save it as a PDF.'),
      msg('Sharing is per recipe and off until you turn it on. "Stop sharing" takes the link down again, and anyone still holding it sees nothing.'),
      msg('Your private notes and ratings are never part of a shared link, even though they sit on the same recipe.'),
      msg('The old "Copy share link" button handed out a link that only worked for people who already had an account; it now creates a link that genuinely works for anyone.'),
      msg('Cook mode now fills the screen on a laptop or desktop again, instead of being squeezed into a narrow column.'),
      msg('A shared link now also introduces the app to whoever opens it, with a new "About" page at /about listing everything it can do — reachable from the sign-in screen too.'),
      msg('The app goes by one name everywhere now: Speisekammer, including the browser tab and the installed app on your phone.'),
      msg('Shared pages follow your device’s light or dark setting, which they previously ignored.'),
    ],
  },
  {
    id: '2026-11-17',
    title: msg('Moved to Google\'s Gemini 4 models'),
    items: [
      msg('Recipe extraction, tagging and the rest now run on Gemini 4, the generation that replaced the models this app was using.'),
      msg('The old model tier had been returning "high demand" errors; the new one is answering normally.'),
      msg('A failed AI request now explains itself instead of showing Google\'s raw error, and says when the problem is ours rather than your recipe.'),
      msg('Requests that fail because the service is briefly busy are retried automatically — previously that only worked for the quick tasks, never for recipe extraction.'),
    ],
  },
  {
    id: '2026-09-05',
    title: msg('Ratings you each own, and a faster brain'),
    items: [
      msg('You and anyone you are connected with can now rate the same recipe separately. Your stars are yours; theirs appear underneath.'),
      msg('Filtering the vault by a connected person actually works. Picking someone used to leave every recipe on screen.'),
      msg('Each AI task can run on its own model. Put tagging and shopping lists on the cheap one and keep extraction on the capable one, in Settings.'),
      msg('Settings can be saved again. Changing your model or temperature unit had been silently failing.'),
      msg('Recipe extraction now uses Google’s current Gemini release automatically, so it keeps improving without an update.'),
      msg('AI requests retry themselves when Google is briefly overloaded, instead of showing you an error.'),
      msg('The notes field no longer calls itself “Personal”. It now says who can actually read it.'),
      msg('Installed app on a phone: new versions arrive on their own rather than needing a reinstall.'),
    ],
  },
];

export const LATEST_RELEASE_ID = RELEASES[0]?.id ?? '';

const STORAGE_KEY = 'changelog-seen';

/** The newest release id this reader has acknowledged, or null if never. */
export function readSeenReleaseId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode, or storage blocked. Treating it as "seen" is the quiet
    // choice: a reader who cannot persist the acknowledgement would otherwise
    // be shown the same notes on every single load.
    return LATEST_RELEASE_ID;
  }
}

export function markReleasesSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, LATEST_RELEASE_ID);
  } catch {
    // Nothing to do — see readSeenReleaseId.
  }
}

/** Releases newer than what the reader has seen. Empty when they are up to date. */
export function unreadReleases(seen: string | null = readSeenReleaseId()): ReleaseNote[] {
  if (!seen) {
    // First ever visit. Someone new to the app has no "new" to catch up on, and
    // opening with a changelog is a poor first impression.
    return [];
  }
  return RELEASES.filter((r) => r.id > seen);
}
