import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase } from './_lib/supabase.js';
import { captureException } from './_lib/sentry.js';
import { shareSchema } from './_lib/schemas.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = shareSchema.parse(req.body);
    const supabase = getServerSupabase();

    // ── SEND ──────────────────────────────────────────────────────────────────
    if (body.action === 'send') {
      const { recipeId, recipientEmail, senderUserId, senderEmail } = body;

      if (senderEmail.toLowerCase() === recipientEmail.toLowerCase()) {
        return res.status(400).json({ error: 'You cannot send a recipe to yourself.' });
      }

      // Fetch the recipe to get snapshot fields and verify sender owns it
      const { data: recipe, error: recipeErr } = await supabase
        .from('recipes')
        .select('id, title, description, image_url, user_id')
        .eq('id', recipeId)
        .single();

      if (recipeErr || !recipe) return res.status(404).json({ error: 'Recipe not found.' });
      if (recipe.user_id && recipe.user_id !== senderUserId) {
        return res.status(403).json({ error: 'You do not own this recipe.' });
      }

      // Check if a pending share already exists to this recipient for this recipe
      const { data: existing } = await supabase
        .from('recipe_shares')
        .select('id')
        .eq('recipe_id', recipeId)
        .eq('recipient_email', recipientEmail.toLowerCase())
        .eq('status', 'pending')
        .maybeSingle();

      if (existing) {
        return res.status(409).json({ error: 'You already sent this recipe to that address — it is still pending.' });
      }

      const { error: insertErr } = await supabase.from('recipe_shares').insert({
        recipe_id: recipeId,
        recipe_title: recipe.title,
        recipe_description: recipe.description ?? null,
        recipe_image_url: recipe.image_url ?? null,
        sender_id: senderUserId,
        sender_email: senderEmail.toLowerCase(),
        recipient_email: recipientEmail.toLowerCase(),
      });

      if (insertErr) throw insertErr;

      // Upsert sender's contact list
      await supabase.from('contacts').upsert(
        { user_id: senderUserId, contact_email: recipientEmail.toLowerCase() },
        { onConflict: 'user_id,contact_email' },
      );

      return res.status(200).json({ ok: true });
    }

    // ── ACCEPT ─────────────────────────────────────────────────────────────────
    if (body.action === 'accept') {
      const { shareId, recipientUserId, recipientEmail } = body;

      // Fetch the share and verify it belongs to this recipient
      const { data: share, error: shareErr } = await supabase
        .from('recipe_shares')
        .select('*')
        .eq('id', shareId)
        .eq('recipient_email', recipientEmail.toLowerCase())
        .eq('status', 'pending')
        .single();

      if (shareErr || !share) return res.status(404).json({ error: 'Share not found or already processed.' });

      // Fetch the original recipe (service key bypasses RLS)
      const { data: original, error: origErr } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', share.recipe_id)
        .single();

      if (origErr || !original) {
        // Recipe was deleted — still mark as accepted but note it
        await supabase.from('recipe_shares').update({ status: 'accepted' }).eq('id', shareId);
        return res.status(404).json({ error: 'The original recipe no longer exists.' });
      }

      // Insert a copy of the recipe for the recipient
      const { data: newRecipe, error: copyErr } = await supabase
        .from('recipes')
        .insert({
          title: original.title,
          description: original.description,
          ingredients: original.ingredients,
          instructions: original.instructions,
          image_url: original.image_url,
          servings: original.servings,
          original_servings: original.original_servings,
          prep_time_mins: original.prep_time_mins,
          cook_time_mins: original.cook_time_mins,
          tags: original.tags,
          nutrition: original.nutrition,
          source_url: original.source_url,
          source_name: original.source_name,
          original_language: original.original_language,
          user_id: recipientUserId,
        })
        .select('id')
        .single();

      if (copyErr || !newRecipe) throw copyErr ?? new Error('Failed to copy recipe.');

      // Copy all translations
      const { data: translations } = await supabase
        .from('recipe_translations')
        .select('*')
        .eq('recipe_id', share.recipe_id);

      if (translations && translations.length > 0) {
        await supabase.from('recipe_translations').insert(
          translations.map((t) => ({
            recipe_id: newRecipe.id,
            language_code: t.language_code,
            title: t.title,
            description: t.description,
            instructions: t.instructions,
            ingredients: t.ingredients,
          })),
        );
      }

      // Mark share accepted
      await supabase.from('recipe_shares').update({ status: 'accepted' }).eq('id', shareId);

      // Add sender to recipient's contacts
      await supabase.from('contacts').upsert(
        { user_id: recipientUserId, contact_email: share.sender_email },
        { onConflict: 'user_id,contact_email' },
      );

      return res.status(200).json({ ok: true, newRecipeId: newRecipe.id });
    }

    // ── REJECT ─────────────────────────────────────────────────────────────────
    if (body.action === 'reject') {
      const { shareId, recipientEmail } = body;

      const { error: rejectErr } = await supabase
        .from('recipe_shares')
        .update({ status: 'rejected' })
        .eq('id', shareId)
        .eq('recipient_email', recipientEmail.toLowerCase())
        .eq('status', 'pending');

      if (rejectErr) throw rejectErr;
      return res.status(200).json({ ok: true });
    }

  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
    }
    captureException(err);
    console.error('Share error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to process share request' });
  }
}
