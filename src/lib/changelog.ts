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
