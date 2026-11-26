import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getAuthenticatedUser, getServerSupabase } from './_lib/supabase.js';
import { captureException } from './_lib/sentry.js';
import { shareSchema } from './_lib/schemas.js';
import { isOwnPhotoUrl } from '../shared/photoUrl.js';

/** Recipes one account may send in a UTC day. */
export const DAILY_SHARE_LIMIT = 30;

function startOfUtcDay(): string {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = shareSchema.parse(req.body);
    const supabase = getServerSupabase();
    const user = await getAuthenticatedUser(req.headers.authorization as string | undefined);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!user.email) return res.status(403).json({ error: 'Your account needs an email address to share recipes.' });

    if (body.action === 'send') {
      const { recipeId, recipientEmail } = body;
      const senderEmail = user.email.toLowerCase();
      const normalizedRecipient = recipientEmail.toLowerCase();
      if (senderEmail === normalizedRecipient) {
        return res.status(400).json({ error: 'You cannot send a recipe to yourself.' });
      }
      const { data: recipe, error: recipeErr } = await supabase.from('recipes').select('id, title, description, image_url, user_id').eq('id', recipeId).single();
      if (recipeErr || !recipe) return res.status(404).json({ error: 'Recipe not found.' });
      if (recipe.user_id !== user.id) return res.status(403).json({ error: 'You do not own this recipe.' });
      // Every share lands in somebody's inbox, so a day's sending is bounded:
      // otherwise one account could fill any address's inbox without end.
      const { count: sentToday, error: countErr } = await supabase.from('recipe_shares').select('id', { count: 'exact', head: true }).eq('sender_id', user.id).gte('created_at', startOfUtcDay());
      if (countErr) throw countErr;
      if ((sentToday ?? 0) >= DAILY_SHARE_LIMIT) {
        return res.status(429).json({ error: `You can send up to ${DAILY_SHARE_LIMIT} recipes a day. Try again tomorrow.` });
      }
      const { data: existing } = await supabase.from('recipe_shares').select('id').eq('recipe_id', recipeId).eq('recipient_email', normalizedRecipient).eq('status', 'pending').maybeSingle();
      if (existing) return res.status(409).json({ error: 'You already sent this recipe to that address — it is still pending.' });
      // The preview picture loads in the recipient's inbox before they have
      // chosen anything, so only one of our own photos travels with it: any
      // other address could be a tracking pixel that reports when, and from
      // where, the inbox was opened.
      const previewImage = isOwnPhotoUrl(recipe.image_url, process.env.VITE_SUPABASE_URL) ? recipe.image_url : null;
      const { error: insertErr } = await supabase.from('recipe_shares').insert({ recipe_id: recipeId, recipe_title: recipe.title, recipe_description: recipe.description ?? null, recipe_image_url: previewImage, sender_id: user.id, sender_email: senderEmail, recipient_email: normalizedRecipient });
      if (insertErr) throw insertErr;
      await supabase.from('contacts').upsert({ user_id: user.id, contact_email: normalizedRecipient }, { onConflict: 'user_id,contact_email' });
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'accept') {
      const { shareId } = body;
      // Shares are addressed by email: only someone who proved they own the
      // address may take what was sent to it.
      if (!user.emailConfirmed) return res.status(403).json({ error: 'Confirm your email address before accepting recipes sent to it.' });
      const recipientEmail = user.email.toLowerCase();
      // Claimed before anything is copied, in one statement: two accepts of
      // the same share (a double tap, two tabs) cannot both get past this, so
      // the recipe is copied once.
      const { data: share, error: shareErr } = await supabase.from('recipe_shares').update({ status: 'accepted' }).eq('id', shareId).eq('recipient_email', recipientEmail).eq('status', 'pending').select('*').maybeSingle();
      if (shareErr) throw shareErr;
      if (!share) return res.status(404).json({ error: 'Share not found or already processed.' });
      // The service key reads any recipe, so the share row alone must not
      // decide which one: only a recipe the sender still owns is copied. The
      // recipient could once rewrite recipe_id in their own row and copy any
      // recipe in the database this way (migration 0074 took that right away;
      // this check stands on its own).
      const { data: original, error: origErr } = await supabase.from('recipes').select('*').eq('id', share.recipe_id).eq('user_id', share.sender_id).maybeSingle();
      if (origErr) throw origErr;
      if (!original) return res.status(404).json({ error: 'The original recipe no longer exists.' });
      const { data: newRecipe, error: copyErr } = await supabase.from('recipes').insert({ title: original.title, description: original.description, ingredients: original.ingredients, instructions: original.instructions, image_url: original.image_url, servings: original.servings, original_servings: original.original_servings, prep_time_mins: original.prep_time_mins, cook_time_mins: original.cook_time_mins, tags: original.tags, nutrition: original.nutrition, source_url: original.source_url, source_name: original.source_name, original_language: original.original_language, user_id: user.id }).select('id').single();
      if (copyErr || !newRecipe) {
        // Nothing was copied: give the share back, so it can be accepted again.
        await supabase.from('recipe_shares').update({ status: 'pending' }).eq('id', shareId);
        throw copyErr ?? new Error('Failed to copy recipe.');
      }
      const { data: translations } = await supabase.from('recipe_translations').select('*').eq('recipe_id', original.id);
      if (translations && translations.length > 0) {
        await supabase.from('recipe_translations').insert(translations.map((t) => ({ recipe_id: newRecipe.id, language_code: t.language_code, title: t.title, description: t.description, instructions: t.instructions, ingredients: t.ingredients })));
      }
      await supabase.from('contacts').upsert({ user_id: user.id, contact_email: share.sender_email }, { onConflict: 'user_id,contact_email' });
      return res.status(200).json({ ok: true, newRecipeId: newRecipe.id });
    }

    if (body.action === 'reject') {
      const { shareId } = body;
      const { error: rejectErr } = await supabase.from('recipe_shares').update({ status: 'rejected' }).eq('id', shareId).eq('recipient_email', user.email.toLowerCase()).eq('status', 'pending');
      if (rejectErr) throw rejectErr;
      return res.status(200).json({ ok: true });
    }

  } catch (err: unknown) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
    captureException(err);
    console.error('Share error:', err);
    // Never the raw message: a database error names tables and constraints.
    return res.status(500).json({ error: 'Failed to process share request.' });
  }
}
