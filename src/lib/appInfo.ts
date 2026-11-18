import {
  Link as LinkIcon, Camera, FileText, Search, Sparkles, Tags, FolderOpen,
  ChefHat, Timer, Users, Languages, Printer, CalendarDays, ShoppingCart,
  Package, Share2, Send, HeartHandshake, Smartphone, Moon, Lock,
} from 'lucide-react';
import { LANGUAGES } from '@/lib/constants';

/**
 * One source for everything the app says about itself.
 *
 * The public share page and the About page both describe the product to
 * someone who has never seen it, and a feature list kept twice is a feature
 * list that goes stale in one of the two places. `appInfo.test.ts` guards the
 * parts that must not quietly disappear — the author credit above all.
 */
export const APP_NAME = 'Speisekammer';
export const APP_TAGLINE = 'Your Curated Recipe Vault';

export const AUTHOR_NAME = 'Thomas Holder';
export const AUTHOR_URL = 'https://github.com/tom-h2o';

/** The itch the app scratches, in the words a guest would use. */
export const PITCH = {
  problem:
    'Recipes end up scattered — a screenshot here, a bookmark there, a photo of a cookbook page, a printout stuck to the fridge. None of them are searchable, none of them scale, and the one you want is never the one you can find.',
  solution:
    `${APP_NAME} puts them all in one place, in one format. Paste a link, photograph the pages of a cookbook, or drop in a PDF, and it reads the recipe out for you — ingredients, steps, timings and all — ready to search, scale, plan and cook from.`,
} as const;

export interface Capability {
  icon: typeof LinkIcon;
  title: string;
  blurb: string;
}

export interface CapabilityGroup {
  heading: string;
  items: Capability[];
}

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    heading: 'Get recipes in',
    items: [
      { icon: LinkIcon, title: 'From any link', blurb: 'Paste a URL and the recipe is pulled out of the page — no ten paragraphs about someone’s holiday first.' },
      { icon: Camera, title: 'From photos', blurb: 'Photograph up to eight pages of a cookbook at once; a recipe spread across a page turn is stitched back together.' },
      { icon: FileText, title: 'From a PDF', blurb: 'Drop in a PDF and it is read the same way.' },
      { icon: Tags, title: 'Tagged and analysed for you', blurb: 'Tags and nutrition are worked out in the background, so nothing needs filing by hand.' },
    ],
  },
  {
    heading: 'Find them again',
    items: [
      { icon: Search, title: 'Real search', blurb: 'Search across every recipe you have, by title, ingredient or anything in the text.' },
      { icon: Sparkles, title: '“What can I cook?”', blurb: 'List what is actually in the kitchen and get back the recipes that come closest.' },
      { icon: FolderOpen, title: 'Collections and favourites', blurb: 'Group recipes your own way, star the keepers, rate them and keep notes.' },
    ],
  },
  {
    heading: 'Cook from them',
    items: [
      { icon: ChefHat, title: 'Cook mode', blurb: 'One step at a time, full screen, with the ingredients a tap away and your place kept.' },
      { icon: Timer, title: 'Timers from the steps', blurb: '“Simmer for 25 minutes” becomes a timer you can start without typing anything — and it keeps counting with the screen off.' },
      { icon: Users, title: 'Scale the servings', blurb: 'Cooking for two when it was written for six? The amounts follow.' },
      { icon: Languages, title: `${LANGUAGES.length} languages`, blurb: `Translate a recipe into ${LANGUAGES.map((l) => l.label).join(', ')} — and temperatures convert between °C and °F.` },
      { icon: Printer, title: 'Print it properly', blurb: 'A clean sheet for the kitchen or a PDF to keep, not a screenshot of the app.' },
    ],
  },
  {
    heading: 'Plan the week',
    items: [
      { icon: CalendarDays, title: 'Meal planner', blurb: 'Put recipes on a seven-day calendar, by meal.' },
      { icon: ShoppingCart, title: 'Shopping list from the plan', blurb: 'Turn the week into one list, combined and sorted, instead of reading back through every recipe.' },
      { icon: Package, title: 'Pantry', blurb: 'Track what you already have so the list only asks for what you do not.' },
    ],
  },
  {
    heading: 'Share it',
    items: [
      { icon: Share2, title: 'A link anyone can open', blurb: 'Exactly the sort of link that brought you here: no account, no app, and you can switch it off again whenever you like.' },
      { icon: Send, title: 'Send to another cook', blurb: 'Send a recipe straight to someone else who uses the app; it lands in their inbox to accept or decline.' },
      { icon: HeartHandshake, title: 'Share a whole vault', blurb: 'Connect with a partner or housemate and read each other’s recipes — theirs stay theirs, yours stay yours.' },
    ],
  },
  {
    heading: 'And the app itself',
    items: [
      { icon: Smartphone, title: 'Installs like an app', blurb: 'Add it to your home screen on a phone or tablet and it opens like any other app.' },
      { icon: Moon, title: 'Light and dark', blurb: 'Follows whatever your device is set to.' },
      { icon: Lock, title: 'Private by default', blurb: 'Your recipes are yours. Nothing is visible to anyone else unless you share it on purpose.' },
    ],
  },
];
