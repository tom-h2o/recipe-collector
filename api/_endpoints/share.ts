import type { Context } from 'hono';
import { ZodError } from 'zod';
import { getServerSupabase } from './_lib/supabase.js';
import { captureException } from './_lib/sentry.js';
import { shareSchema } from './_lib/schemas.js';

export default async function handler(c: Context) {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = shareSchema.parse(body);
    const supabase = getServerSupabase();

    // ── SEND ──────────────────────────────────────────────────────────────────
    if (parsed.action === 'send') {
      const { recipeId, recipientEmail, senderUserId, senderEmail } = parsed;

      if (senderEmail.toLowerCase() === recipientEmail.toLowerCase()) {
        return c.json({ error: 'You cannot send a recipe to yourself.' }, 400);
      }

      const { data: recipe, error: recipeErr } = await supabase
        .from('recipes')
        .select('id, title, description, image_url, user_id')
        .eq('id', recipeId)
        .single();

      if (recipeErr || !recipe) return c.json({ error: 'Recipe not found.' }, 404);
      if (recipe.user_id && recipe.user_id !== senderUserId) {
        return c.json({ error: 'You do not own this recipe.' }, 403);
      }

      const { data: existing } = await supabase
        .from('recipe_shares')
        .select('id')
        .eq('recipe_id', recipeId)
        .eq('recipient_email', recipientEmail.toLowerCase())
        .eq('status', 'pending')
        .maybeSingle();

      if (existing) {
        return c.json({ error: 'You already sent this recipe to that address — it is still pending.' }, 409);
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

      await supabase.from('contacts').upsert(
        { user_id: senderUserId, contact_email: recipientEmail.toLowerCase() },
        { onConflict: 'user_id,contact_email' },
      );

      return c.json({ ok: true });
    }

    // ── ACCEPT ─────────────────────────────────────────────────────────────────
    if (parsed.action === 'accept') {
      const { shareId, recipientUserId, recipientEmail } = parsed;

      const { data: share, error: shareErr } = await supabase
        .from('recipe_shares')
        .select('*')
        .eq('id', shareId)
        .eq('recipient_email', recipientEmail.toLowerCase())
        .eq('status', 'pending')
        .single();

      if (shareErr || !share) return c.json({ error: 'Share not found or already processed.' }, 404);

      const { data: original, error: origErr } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', share.recipe_id)
        .single();

      if (origErr || !original) {
        await supabase.from('recipe_shares').update({ status: 'accepted' }).eq('id', shareId);
        return c.json({ error: 'The original recipe no longer exists.' }, 404);
      }

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

      await supabase.from('recipe_shares').update({ status: 'accepted' }).eq('id', shareId);
      await supabase.from('contacts').upsert(
        { user_id: recipientUserId, contact_email: share.sender_email },
        { onConflict: 'user_id,contact_email' },
      );

      return c.json({ ok: true, newRecipeId: newRecipe.id });
    }

    // ── REJECT ─────────────────────────────────────────────────────────────────
    if (parsed.action === 'reject') {
      const { shareId, recipientEmail } = parsed;

      const { error: rejectErr } = await supabase
        .from('recipe_shares')
        .update({ status: 'rejected' })
        .eq('id', shareId)
        .eq('recipient_email', recipientEmail.toLowerCase())
        .eq('status', 'pending');

      if (rejectErr) throw rejectErr;
      return c.json({ ok: true });
    }

  } catch (err: unknown) {
    if (err instanceof ZodError) return c.json({ error: err.errors[0]?.message ?? 'Invalid request' }, 400);
    captureException(err);
    console.error('Share error:', err);
    return c.json({ error: err instanceof Error ? err.message : 'Failed to process share request' }, 500);
  }
}
