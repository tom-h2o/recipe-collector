import type { User } from '@supabase/supabase-js';

/**
 * A person's own name for themselves, set in the account sheet ("Your name")
 * and kept in their account's metadata; a Google sign-in fills it in itself.
 */
export const MAX_NAME_LENGTH = 60;

type Named = Pick<User, 'email' | 'user_metadata'>;

export function displayNameOf(user: Named): string {
  const meta = user.user_metadata ?? {};
  const name = typeof meta.full_name === 'string' && meta.full_name.trim()
    ? meta.full_name
    : typeof meta.name === 'string' ? meta.name : '';
  return name.trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * The letters on the avatar: the first letters of the first and last word of
 * the name, or, with no name, the first letter of the email address.
 */
export function initialsOf(user: Named): string {
  const words = displayNameOf(user).split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    const letters = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
    return letters.map((w) => Array.from(w)[0]).join('').toUpperCase();
  }
  return Array.from(user.email ?? '')[0]?.toUpperCase() ?? '?';
}
