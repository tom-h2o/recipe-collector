import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getUserId } from './_lib/supabase.js';
import { captureException } from './_lib/sentry.js';

const ADMIN_EMAIL = process.env.VITE_ADMIN_EMAIL ?? '';

async function assertAdmin(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.admin.getUserById(userId);
  if (!user || user.email !== ADMIN_EMAIL) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return userId;
}

async function deleteUserData(userId: string): Promise<void> {
  const supabase = getServerSupabase();
  await supabase.from('meal_plan').delete().eq('user_id', userId);
  await supabase.from('shopping_list').delete().eq('user_id', userId);
  await supabase.from('settings').delete().eq('user_id', userId);
  await supabase.from('recipes').delete().eq('user_id', userId);
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── GET /api/account — admin dashboard ────────────────────────────────────
    if (req.method === 'GET') {
      const adminId = await assertAdmin(req, res);
      if (!adminId) return;

      const supabase = getServerSupabase();
      const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });

      const { data: recipeCounts } = await supabase.from('recipes').select('user_id').not('user_id', 'is', null);
      const recipeCountMap: Record<string, number> = {};
      for (const r of recipeCounts ?? []) recipeCountMap[r.user_id] = (recipeCountMap[r.user_id] ?? 0) + 1;

      const { data: aiCounts } = await supabase.from('gemini_logs').select('user_id');
      const aiCountMap: Record<string, number> = {};
      for (const r of aiCounts ?? []) if (r.user_id) aiCountMap[r.user_id] = (aiCountMap[r.user_id] ?? 0) + 1;

      const users = authUsers.map((u) => ({
        id: u.id,
        email: u.email ?? '',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        recipe_count: recipeCountMap[u.id] ?? 0,
        ai_call_count: aiCountMap[u.id] ?? 0,
      }));

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { count: totalRecipes } = await supabase.from('recipes').select('*', { count: 'exact', head: true });
      const { count: totalAiCalls } = await supabase.from('gemini_logs').select('*', { count: 'exact', head: true });
      const { count: callsToday } = await supabase.from('gemini_logs').select('*', { count: 'exact', head: true }).gte('created_at', todayStart);
      const { count: callsThisWeek } = await supabase.from('gemini_logs').select('*', { count: 'exact', head: true }).gte('created_at', weekStart);

      const { data: modelRows } = await supabase.from('gemini_logs').select('model');
      const modelMap: Record<string, number> = {};
      for (const r of modelRows ?? []) if (r.model) modelMap[r.model] = (modelMap[r.model] ?? 0) + 1;
      const model_breakdown = Object.entries(modelMap).map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count);

      const { data: recentLogs } = await supabase
        .from('gemini_logs')
        .select('id, created_at, endpoint, model, status, latency_ms, user_id')
        .order('created_at', { ascending: false })
        .limit(100);

      const userEmailMap: Record<string, string> = {};
      for (const u of authUsers) userEmailMap[u.id] = u.email ?? '';

      const logs = (recentLogs ?? []).map((l) => ({ ...l, user_email: l.user_id ? (userEmailMap[l.user_id] ?? null) : null }));

      const { data: recentRecipes } = await supabase
        .from('recipes')
        .select('id, title, description, image_url, tags, created_at, user_id, is_favourite, servings, prep_time_mins, cook_time_mins')
        .order('created_at', { ascending: false })
        .limit(200);

      const recipes = (recentRecipes ?? []).map((r) => ({
        ...r,
        user_email: r.user_id ? (userEmailMap[r.user_id] ?? null) : null,
      }));

      return res.status(200).json({
        stats: { total_users: authUsers.length, total_recipes: totalRecipes ?? 0, total_ai_calls: totalAiCalls ?? 0, calls_today: callsToday ?? 0, calls_this_week: callsThisWeek ?? 0, model_breakdown },
        users,
        logs,
        recipes,
      });
    }

    // ── DELETE /api/account — delete own account or (admin) any user ──────────
    if (req.method === 'DELETE') {
      const targetUserId = req.query.userId as string | undefined;

      if (targetUserId) {
        // Admin deleting another user
        const adminId = await assertAdmin(req, res);
        if (!adminId) return;
        await deleteUserData(targetUserId);
      } else {
        // User deleting their own account
        const userId = await getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        await deleteUserData(userId);
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    captureException(err);
    const message = err instanceof Error ? err.message : 'Request failed';
    return res.status(500).json({ error: message });
  }
}
