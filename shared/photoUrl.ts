/**
 * Whether an address is a photo in our own storage bucket (recipe-images on
 * this project's Supabase), as opposed to a picture hosted anywhere else.
 *
 * Used where a picture would load before the person has chosen to open
 * anything: the inbox's preview of a recipe someone sent. A foreign address
 * there could be a tracking pixel telling the sender when, and from which IP
 * address, the inbox was opened.
 */
export function isOwnPhotoUrl(url: string | null | undefined, supabaseUrl: string | null | undefined): boolean {
  if (!url || !supabaseUrl) return false;
  let photo: URL;
  let project: URL;
  try {
    photo = new URL(url);
    project = new URL(supabaseUrl);
  } catch {
    return false;
  }
  return photo.protocol === 'https:'
    && photo.origin === project.origin
    && photo.pathname.startsWith('/storage/v1/object/public/recipe-images/')
    && !photo.pathname.includes('..');
}
