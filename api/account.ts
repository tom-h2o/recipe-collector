import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getUserId } from './_lib/supabase.js';
import { captureException } from './_lib/sentry.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = getServerSupabase();

    // Delete tables without cascade first, in dependency order
    await supabase.from('meal_plan').delete().eq('user_id', userId);
    await supabase.from('shopping_list').delete().eq('user_id', userId);
    await supabase.from('settings').delete().eq('user_id', userId);
    await supabase.from('recipes').delete().eq('user_id', userId);

    // Delete the auth user — tables with ON DELETE CASCADE clean up automatically
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (err) {
    captureException(err);
    const message = err instanceof Error ? err.message : 'Failed to delete account';
    return res.status(500).json({ error: message });
  }
}
