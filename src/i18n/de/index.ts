/**
 * The German dictionary, in one file per part of the app. English text → German.
 *
 *   common   words used everywhere (navigation names, Cancel, Save…)
 *   vault    the app shell, the vault, filters, collections, cards, imports
 *   recipe   the recipe drawer, cook mode, printing, sending, the inbox
 *   create   adding a recipe, suggestions, Wochenplan, Einkauf, the public pages
 *   account  sign-in, the account menu, Settings, feedback, load failures
 *   admin    the admin dashboard and the release notes
 *   server   messages the server writes in English (errors, import failures)
 *
 * `common` goes last so that its wording wins wherever a key was repeated.
 */
import common from './common';
import vault from './vault';
import recipe from './recipe';
import create from './create';
import account from './account';
import admin from './admin';
import server from './server';

export const fragments: Record<string, Record<string, string>> = {
  vault, recipe, create, account, admin, server, common,
};

export const de: Record<string, string> = Object.assign({}, ...Object.values(fragments));
