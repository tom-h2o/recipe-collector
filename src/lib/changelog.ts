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
 */
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
    id: '2026-12-17',
    title: 'The top bar fits the screen',
    items: [
      'On phones 360 pixels wide, many Android phones among them, the bar at the top no longer runs past the edge of the screen, so the page no longer slides sideways when you swipe.',
      'On phones its buttons sit a little closer together, and on the narrowest ones the app’s name is a little smaller.',
      'On a computer, the buttons at the top no longer stick out past the right edge of the page. To make room for the tabs, Suggest is now a round wand button there, as on a phone.',
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-16',
    title: 'Privacy and safety fixes',
    items: [
      'Photos you send from your iPhone are now stored without their hidden details, such as where they were taken.',
      'Signing out now removes the offline copy of your recipes from this device, so the next person to use it cannot see them.',
      'Declining an invitation to connect accounts now really declines it. It used to stay in your inbox.',
      'Connecting accounts now needs a confirmed email address, and recipes sent to you can only be accepted from one.',
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-15',
    title: 'Password reset fixed',
    items: [
      'The link in a “reset your password” email now asks for a new password, as it should. It used to sign you straight in without letting you set one.',
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-14',
    title: 'One Shortcut for pages and links',
    items: [
      'The Safari Shortcut now takes links from Instagram and other apps too, so one entry in the share sheet does both: in Safari it reads the page you have open, anywhere else it sends the link.',
      'The separate “Send link to Speisekammer” Shortcut is no longer needed, and it appeared in Safari as well. The steps for the combined one are under Settings → iPhone Shortcuts.',
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-13',
    title: 'Tidier Settings',
    items: [
      'The tabs in Settings fit on one row of a phone, and the AI models have a tab of their own instead of sitting at the end of General.',
      'The tabs in Settings and on the admin dashboard look like the app’s main tab bar, and work with the arrow keys.',
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-12',
    title: 'Recipes from Instagram',
    items: [
      'A third iPhone Shortcut, “Send link to Speisekammer”: on an Instagram post or reel, tap Share and send it. The recipe is read from the post’s caption. Set it up under Settings → iPhone Shortcuts. Links from other apps work too.',
      'An Instagram link pasted into Add recipe → Website works the same way.',
      'Recipes from Instagram keep their photo. Instagram’s picture links stop working after a few days, so Speisekammer now keeps its own copy.',
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-11',
    title: 'Ingredients in cook mode',
    items: [
      'Cook mode shows the ingredients each step needs right under it, with amounts. Tap one to tick it off.',
      'The full list has its own Ingredients button. On a phone it slides up from the bottom, so the step stays in view.',
      'The delete confirmation has bigger buttons.',
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-10',
    title: 'The iPhone Shortcuts answer at once',
    items: [
      'Sending a picture or a Safari page now says “Got it” as soon as it has arrived, instead of waiting while the recipe is read. The recipe appears in the vault about a minute later, marked New.',
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-09',
    title: 'Filter by more, and combine filters',
    items: [
      'Above the vault: Diet, Cuisine, Meal, Main ingredient and More each open a menu, so every tag can be filtered by. Pick from several to combine them, for example Vegetarian and Italian.',
      'New tags: German, Chicken, Meat, Fish & Seafood, Pasta, Salad, Casserole and Meal Prep. New recipes get them automatically; for an older one, use ⋯ → Regenerate tags.',
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-08',
    title: 'A calmer way to add recipes',
    items: [
      'Adding a recipe starts with a choice: from a website, photos, a PDF or text, or Enter it manually for the full editor.',
      'While a recipe is read, the key opens the vault and puts it in. No more second message in the corner.',
      'Filters and tags have a cleaner look, with icons instead of emoji, and the ingredients on each card are a simple list.',
      'The key now shows in the browser tab.',
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-07',
    title: 'Save recipes straight from Safari',
    items: [
      'A second iPhone Shortcut, Save page to Speisekammer: open a recipe in Safari, tap Share and it is saved with its link. It works for sites like REWE and EDEKA that block the link import.',
      'Set it up under Settings → iPhone Shortcuts. It uses the same key as the Photos Shortcut, and needs Allow Running Scripts turned on once in the Shortcuts settings.',
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-06',
    title: 'When a website will not share its recipe',
    items: [
      'Some sites, REWE and EDEKA among them, block apps from reading their pages. Instead of "Forbidden" you now see which site it is and three ways that work: paste the text, save the page as a PDF, or use screenshots. The link stays with the recipe.',
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-05',
    title: 'Add the iPhone Shortcut with one tap',
    items: [
      'Settings → iPhone Shortcut now has an Add to Shortcuts button. Make your key, copy it, tap the button, and paste the key when the Shortcuts app asks for it. No need to build the Shortcut yourself any more.',
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-04',
    title: 'Send recipes straight from your photos',
    items: [
      'With an iPhone Shortcut you can now send recipes from the Photos app: select one or more pictures, tap Share, then Send to Speisekammer. Several pages become one recipe, or one recipe per picture if you prefer. Set it up once under Settings → iPhone Shortcut.',
      'Recipes sent this way are saved straight away. The next time you open the app a banner shows what arrived, each new recipe carries a New badge until you open it, and anything that could not be read is listed with the reason.',
    ],
  },
  {
    // Ids must increase with each release (see 2026-12-02 below).
    id: '2026-12-03',
    title: 'Claude does the AI work now, with Gemini standing by',
    items: [
      'Reading recipes from photos, PDFs and web pages, translating, tagging, nutrition and the rest now run on Anthropic\'s Claude.',
      'Photos you take of a cookbook page or a handwritten card go to Claude\'s strongest model, which reads curved pages and handwriting best. Screenshots are recognised (by what the camera records in a photo, and by the shape of a phone screen) and read by the faster model, since their text is already clean.',
      'Google\'s Gemini stays ready behind it: if Claude is busy or unavailable, the same request goes to Gemini straight away, so a problem at one of them no longer stops the app.',
    ],
  },
  {
    // Ids are compared as strings and must increase with each release, not
    // follow the calendar: an earlier one would count as already read.
    id: '2026-12-02',
    title: 'One set of AI models for everyone',
    items: [
      'The AI models are now chosen once, for everyone, by the app\'s admin. Choosing your own could put a task on a model this app has no allowance for, and then every call to it failed.',
      'Settings still shows which model each task runs on, and what it actually ran as on your recent calls.',
    ],
  },
  {
    // After 2026-11-30, not today's date: ids are compared as strings, and an
    // earlier one would count as already read for anyone who saw that release.
    id: '2026-12-01',
    title: 'Fewer failed imports when Gemini is busy',
    items: [
      'Importing a recipe from a photo or a PDF now waits and tries again when the AI model is busy, as every other AI feature already did. Before, a single busy moment made the import fail straight away.',
      'If the chosen model stays busy or has used up its daily allowance, the app now asks the other model instead of giving up. This works for every AI feature.',
    ],
  },
  {
    id: '2026-11-30',
    title: 'Tags, nutrition and translations on the Lite model',
    items: [
      'If you chose the Lite model for tagging, nutrition or translation, those failed every time: the app asked the model to switch its reasoning off in a way newer Gemini models no longer accept. It now asks each model for the lowest reasoning it offers, and falls back to its default if it refuses.',
    ],
  },
  {
    id: '2026-11-29',
    title: 'Fixed for iPhone, and clearer recipe cards',
    items: [
      'On an iPhone the header sat behind the clock and the camera, where a tap goes to the phone instead of the app. That is why its buttons did nothing and looked blurred. It now starts just below them, and so do the close buttons of a recipe, cook mode and the photo viewer, and the notices that pop up. The buttons at the foot of cook mode no longer sit on the home bar.',
      'The header is also more solid, so a photo scrolling underneath no longer smears behind its buttons.',
      'Each recipe now has a fine edge and a soft shadow, with more room between them, so it is clear where one recipe ends and the next begins.',
    ],
  },
  {
    id: '2026-11-28',
    title: 'A new look: glass',
    items: [
      'The tab bar now floats over the page as a glass capsule, and a tinted pill slides to the tab you choose. On a phone the page runs out softly beneath it. The header, the dropdown menus and the small round buttons that sit on photos are glass too.',
      'Everything you can tap now answers: it fades the moment you touch it and recovers when you let go. Buttons and filters also give a little, and the main green buttons get darker instead of paler.',
      'If your device is set to reduce transparency, the glass becomes solid. If it is set to reduce motion, nothing slides or springs; a tap is still acknowledged by the change in colour.',
    ],
  },
  {
    id: '2026-11-27',
    title: 'Translating no longer gets stuck',
    items: [
      'Opening a recipe could start a translation by itself and lock every language until it finished. A translation now only starts when you choose a language, and while it is being made you can still pick any other language, or the original, to stop it.',
      'A translation that fails, or that you delete, no longer leaves the recipe set to a language it has no text for.',
      'While you are reading a translation, the language picker now offers "Delete this translation" right there. The menu behind the three dots still lists every stored translation.',
    ],
  },
  {
    id: '2026-11-26',
    title: 'Deleting a translation really deletes it',
    items: [
      'Deleting a translation removed the tick but not the translation: choosing the language again showed the same text as before, and no new one was made until you reloaded the app. A deleted translation is now gone, and choosing the language again makes a fresh one.',
      'The language picker is tidier. The small crosses on the languages are gone; deleting a translation is rare, so it has moved into the menu behind the three dots.',
    ],
  },
  {
    id: '2026-11-25',
    title: 'Sending a recipe keeps it open',
    items: [
      'When you send a recipe to a friend, the recipe now stays open behind the email form. Before, it closed as soon as the form appeared, so after sending or cancelling you were back in the vault and had to find the recipe again.',
    ],
  },
  {
    id: '2026-11-24',
    title: 'Translations keep their steps',
    items: [
      'A translated recipe could come back with several steps run together into one point. Each step is now translated on its own, and a translation whose number of steps does not match the recipe is thrown away and asked for again instead of being saved.',
      'A translation saved before this fix stays as it is. To correct one, open the language menu on that recipe, delete the language, and choose it again.',
    ],
  },
  {
    id: '2026-11-23',
    title: 'Fix for a page that kept reloading',
    items: [
      'On some browsers the app could reload itself over and over, flickering and impossible to use. That was a fault in an earlier fix: when a part of the app would not load, it reloaded the page to recover \u2014 and then did so again on every reload. It now reloads once at most.',
      'If part of the app still cannot be loaded after that, you now get a message that says so, with a button to reload and one to reset the saved app files, instead of a blank or flickering page.',
    ],
  },
  {
    id: '2026-11-22',
    title: 'Paste a recipe as text',
    items: [
      'Adding a recipe has a fourth way in: Text. Paste a recipe from a chat message, a note or another app \u2014 ingredients and steps in any order \u2014 and it is sorted into the form for you to check, in the language it was written in.',
      'If what you pasted turns out not to be a recipe, you are told so instead of getting an invented one, and your text stays in the box.',
    ],
  },
  {
    id: '2026-11-21',
    title: 'Translations that come out wrong are no longer kept',
    items: [
      'A translation could come back with stray text from the AI in the middle of the title, and was saved like that \u2014 so the recipe stayed broken in that language until you deleted it. Such a result is now thrown away and asked for again, and if the second try is no better you get a message instead of a damaged recipe.',
      'Tags and nutrition appear sooner after you save a recipe.',
    ],
  },
  {
    id: '2026-11-20',
    title: 'Fixes for a blank page and for deleting translations',
    items: [
      'After an update, the app could open as a blank white page on a device that still had the previous version cached \u2014 it now notices and reloads itself once.',
      'A translation of the recipe\u2019s own original language could not be deleted, which was exactly the one you would want to remove when it came out wrong.',
    ],
  },
  {
    id: '2026-11-19',
    title: 'Better shared links, and a fix for translation',
    items: [
      'Translating a recipe from a connected account used to fail outright. It now works \u2014 the check behind it was asking whether you owned the recipe rather than whether you could see it.',
      'A shared link pasted into WhatsApp, Slack or a message now shows the recipe\u2019s name and photo instead of a bare address. Shared recipes are kept out of search engines.',
      'Guests can now see all of a recipe\u2019s photos, its nutrition, switch between any languages you had already translated it into, and flip between \u00B0C and \u00B0F.',
      'Saving a shared recipe as a PDF now names the file after the recipe.',
      'Recipes with a live public link are marked in your vault, and there is a new "Shared" filter to see them all at once.',
      'Polish is no longer offered as a translation language.',
      'The language picker now ticks the languages a recipe has already been translated into \u2014 those open instantly and cost nothing \u2014 and lets you delete any of them you no longer want.',
      'The options menu behind the three dots no longer runs off the side of the screen on a narrow phone, where half its labels used to be cut off.',
      'Added to your home screen, the app now shows its own key symbol on the deep green of the app itself \u2014 and is called Speisekammer, not the old name it had kept there.',
    ],
  },
  {
    id: '2026-11-18',
    title: 'Share a recipe with someone who has no account',
    items: [
      'Open a recipe, choose "Create public link", and send it to anyone — they can read the whole recipe without signing up or installing anything.',
      'They can change the servings and the amounts follow, step through cook mode with its timers, and print or save it as a PDF.',
      'Sharing is per recipe and off until you turn it on. "Stop sharing" takes the link down again, and anyone still holding it sees nothing.',
      'Your private notes and ratings are never part of a shared link, even though they sit on the same recipe.',
      'The old "Copy share link" button handed out a link that only worked for people who already had an account; it now creates a link that genuinely works for anyone.',
      'Cook mode now fills the screen on a laptop or desktop again, instead of being squeezed into a narrow column.',
      'A shared link now also introduces the app to whoever opens it, with a new "About" page at /about listing everything it can do \u2014 reachable from the sign-in screen too.',
      'The app goes by one name everywhere now: Speisekammer, including the browser tab and the installed app on your phone.',
      'Shared pages follow your device\u2019s light or dark setting, which they previously ignored.',
    ],
  },
  {
    id: '2026-11-17',
    title: 'Moved to Google\'s Gemini 4 models',
    items: [
      'Recipe extraction, tagging and the rest now run on Gemini 4, the generation that replaced the models this app was using.',
      'The old model tier had been returning "high demand" errors; the new one is answering normally.',
      'A failed AI request now explains itself instead of showing Google\'s raw error, and says when the problem is ours rather than your recipe.',
      'Requests that fail because the service is briefly busy are retried automatically — previously that only worked for the quick tasks, never for recipe extraction.',
    ],
  },
  {
    id: '2026-09-05',
    title: 'Ratings you each own, and a faster brain',
    items: [
      'You and anyone you are connected with can now rate the same recipe separately. Your stars are yours; theirs appear underneath.',
      'Filtering the vault by a connected person actually works. Picking someone used to leave every recipe on screen.',
      'Each AI task can run on its own model. Put tagging and shopping lists on the cheap one and keep extraction on the capable one, in Settings.',
      'Settings can be saved again. Changing your model or temperature unit had been silently failing.',
      'Recipe extraction now uses Google’s current Gemini release automatically, so it keeps improving without an update.',
      'AI requests retry themselves when Google is briefly overloaded, instead of showing you an error.',
      'The notes field no longer calls itself “Personal”. It now says who can actually read it.',
      'Installed app on a phone: new versions arrive on their own rather than needing a reinstall.',
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
