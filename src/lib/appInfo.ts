import {
  Link as LinkIcon, Camera, FileText, Search, Sparkles, Tags, FolderOpen,
  ChefHat, Timer, Users, Languages, Printer, CalendarDays, ShoppingCart,
  Package, Share2, Send, HeartHandshake, Smartphone, Moon, Lock,
} from 'lucide-react';
import { LANGUAGES } from '@/lib/constants';
import { msg, type Translate, type Vars } from '@/i18n';

/**
 * One source for everything the app says about itself.
 *
 * The texts are English and marked with msg(); whoever shows one translates it
 * there (`t(PITCH.problem)`, `capabilityText(item, t)`).
 *
 * The public share page and the About page both describe the product to
 * someone who has never seen it, and a feature list kept twice is a feature
 * list that goes stale in one of the two places. `appInfo.test.ts` guards the
 * parts that must not quietly disappear — the author credit above all.
 */
export const APP_NAME = 'Speisekammer';
export const APP_TAGLINE = msg('Your Curated Recipe Vault');

export const AUTHOR_NAME = 'Thomas Holder';
export const AUTHOR_URL = 'https://github.com/tom-h2o';

/** The itch the app scratches, in the words a guest would use. */
export const PITCH = {
  problem: msg(
    'Recipes end up scattered — a screenshot here, a bookmark there, a photo of a cookbook page, a printout stuck to the fridge. None of them are searchable, none of them scale, and the one you want is never the one you can find.',
  ),
  solution: msg(
    'Speisekammer puts them all in one place, in one format. Paste a link, photograph the pages of a cookbook, or drop in a PDF, and it reads the recipe out for you — ingredients, steps, timings and all — ready to search, scale, plan and cook from.',
  ),
} as const;

/**
 * What happens to a person's data, said plainly. Shown on /about and, in one
 * line, on the sign-in screen. It is a note for invited people, not a privacy
 * policy: that (and an Impressum) is due when the app opens to anyone.
 * Keep it true: a service added to the app belongs in this list.
 */
export const DATA_NOTE_SHORT =
  msg('Recipes, photos and pages you add are sent to Anthropic and Google to be read by their AI.');

export const DATA_NOTE: { title: string; text: string }[] = [
  {
    title: msg('What is stored'),
    text: msg('Your email address, your recipes with their photos and notes, your meal plan, shopping list and settings. They are kept in a database at Supabase and are only visible to you, to accounts you connect yours with, and to the person who runs the app.'),
  },
  {
    title: msg('What is sent to AI services'),
    text: msg('To read a recipe from a link, a photo, a PDF or pasted text, and to tag, translate, scale or estimate nutrition, the recipe (or the page, photo or file) is sent to Anthropic (Claude) or Google (Gemini). The text sent and received is kept in a log for 30 days to find faults.'),
  },
  {
    title: msg('What else leaves the app'),
    text: msg('The app is hosted at Vercel. When a recipe has no picture, its title is used to search Unsplash for one. Technical error reports go to Sentry, without recipe contents, sign-in details or your address.'),
  },
  {
    title: msg('What is public'),
    text: msg('Nothing, unless you create a share link for a recipe. Anyone with that link can read that recipe until you remove the link. Photo files are reachable by anyone who has their exact address.'),
  },
  {
    title: msg('How to delete it'),
    text: msg('Account menu → Delete account removes your account, recipes, photos, plans and logs for good.'),
  },
];

export interface Capability {
  icon: typeof LinkIcon;
  title: string;
  blurb: string;
  /**
   * For a title or blurb with a number or a list in it: the same two texts
   * with `{placeholders}`, which is what the dictionary knows them by.
   */
  translate?: { title: string; blurb: string; vars: Vars };
}

/** A capability's title and blurb in the app's language. */
export function capabilityText(item: Capability, t: Translate): { title: string; blurb: string } {
  const from = item.translate;
  return from
    ? { title: t(from.title, from.vars), blurb: t(from.blurb, from.vars) }
    : { title: t(item.title), blurb: t(item.blurb) };
}

export interface CapabilityGroup {
  heading: string;
  items: Capability[];
}

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    heading: msg('Get recipes in'),
    items: [
      { icon: LinkIcon, title: msg('From any link'), blurb: msg('Paste a URL and the recipe is pulled out of the page — no ten paragraphs about someone’s holiday first.') },
      { icon: Camera, title: msg('From photos'), blurb: msg('Photograph up to eight pages of a cookbook at once; a recipe spread across a page turn is stitched back together.') },
      { icon: FileText, title: msg('From a PDF'), blurb: msg('Drop in a PDF and it is read the same way.') },
      { icon: Tags, title: msg('Tagged and analysed for you'), blurb: msg('Tags and nutrition are worked out in the background, so nothing needs filing by hand.') },
    ],
  },
  {
    heading: msg('Find them again'),
    items: [
      { icon: Search, title: msg('Real search'), blurb: msg('Search across every recipe you have, by title, ingredient or anything in the text.') },
      { icon: Sparkles, title: msg('“What can I cook?”'), blurb: msg('List what is actually in the kitchen and get back the recipes that come closest.') },
      { icon: FolderOpen, title: msg('Collections and favourites'), blurb: msg('Group recipes your own way, star the keepers, rate them and keep notes.') },
    ],
  },
  {
    heading: msg('Cook from them'),
    items: [
      { icon: ChefHat, title: msg('Cook mode'), blurb: msg('One step at a time, full screen, with the ingredients a tap away and your place kept.') },
      { icon: Timer, title: msg('Timers from the steps'), blurb: msg('“Simmer for 25 minutes” becomes a timer you can start without typing anything — and it keeps counting with the screen off.') },
      { icon: Users, title: msg('Scale the servings'), blurb: msg('Cooking for two when it was written for six? The amounts follow.') },
      {
        icon: Languages,
        title: `${LANGUAGES.length} languages`,
        blurb: `Translate a recipe into ${LANGUAGES.map((l) => l.label).join(', ')} — and temperatures convert between °C and °F.`,
        translate: {
          title: msg('{count} languages'),
          blurb: msg('Translate a recipe into {languages} — and temperatures convert between °C and °F.'),
          vars: { count: LANGUAGES.length, languages: LANGUAGES.map((l) => l.label).join(', ') },
        },
      },
      { icon: Printer, title: msg('Print it properly'), blurb: msg('A clean sheet for the kitchen or a PDF to keep, not a screenshot of the app.') },
    ],
  },
  {
    heading: msg('Plan the week'),
    items: [
      { icon: CalendarDays, title: msg('Meal planner'), blurb: msg('Put recipes on a seven-day calendar, by meal.') },
      { icon: ShoppingCart, title: msg('Shopping list from the plan'), blurb: msg('Turn the week into one list, combined and sorted, instead of reading back through every recipe.') },
      { icon: Package, title: msg('Pantry'), blurb: msg('Track what you already have so the list only asks for what you do not.') },
    ],
  },
  {
    heading: msg('Share it'),
    items: [
      { icon: Share2, title: msg('A link anyone can open'), blurb: msg('Exactly the sort of link that brought you here: no account, no app, and you can switch it off again whenever you like.') },
      { icon: Send, title: msg('Send to another cook'), blurb: msg('Send a recipe straight to someone else who uses the app; it lands in their inbox to accept or decline.') },
      { icon: HeartHandshake, title: msg('Share a whole vault'), blurb: msg('Connect with a partner or housemate and read each other’s recipes — theirs stay theirs, yours stay yours.') },
    ],
  },
  {
    heading: msg('And the app itself'),
    items: [
      { icon: Smartphone, title: msg('Installs like an app'), blurb: msg('Add it to your home screen on a phone or tablet and it opens like any other app.') },
      { icon: Moon, title: msg('Light and dark'), blurb: msg('Follows whatever your device is set to.') },
      { icon: Lock, title: msg('Private by default'), blurb: msg('Your recipes are yours. Nothing is visible to anyone else unless you share it on purpose.') },
    ],
  },
];
