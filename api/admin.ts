import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getUserId } from './_lib/supabase.js';
import { captureException } from './_lib/sentry.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';

async function assertAdmin(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return null; }

  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.admin.getUserById(userId);
  if (!user || user.email !== ADMIN_EMAIL) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return userId;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── GET — dashboard data ───────────────────────────────────────────────────
    if (req.method === 'GET') {
      const adminId = await assertAdmin(req, res);
      if (!adminId) return;

      const supabase = getServerSupabase();

      // All auth users
      const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });

      // Recipe counts per user
      const { data: recipeCounts } = await supabase
        .from('recipes')
        .select('user_id')
        .not('user_id', 'is', null);

      const recipeCountMap: Record<string, number> = {};
      for (const r of recipeCounts ?? []) {
        recipeCountMap[r.user_id] = (recipeCountMap[r.user_id] ?? 0) + 1;
      }

      // AI call counts per user
      const { data: aiCounts } = await supabase
        .from('gemini_logs')
        .select('user_id');

      const aiCountMap: Record<string, number> = {};
      for (const r of aiCounts ?? []) {
        if (r.user_id) aiCountMap[r.user_id] = (aiCountMap[r.user_id] ?? 0) + 1;
      }

      const users = authUsers.map((u) => ({
        id: u.id,
        email: u.email ?? '',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        recipe_count: recipeCountMap[u.id] ?? 0,
        ai_call_count: aiCountMap[u.id] ?? 0,
      }));

      // Global stats
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { count: totalRecipes } = await supabase.from('recipes').select('*', { count: 'exact', head: true });
      const { count: totalAiCalls } = await supabase.from('gemini_logs').select('*', { count: 'exact', head: true });
      const { count: callsToday } = await supabase.from('gemini_logs').select('*', { count: 'exact', head: true }).gte('created_at', todayStart);
      const { count: callsThisWeek } = await supabase.from('gemini_logs').select('*', { count: 'exact', head: true }).gte('created_at', weekStart);

      const { data: modelRows } = await supabase.from('gemini_logs').select('model');
      const modelMap: Record<string, number> = {};
      for (const r of modelRows ?? []) {
        if (r.model) modelMap[r.model] = (modelMap[r.model] ?? 0) + 1;
      }
      const model_breakdown = Object.entries(modelMap)
        .map(([model, count]) => ({ model, count }))
        .sort((a, b) => b.count - a.count);

      // Recent logs (all users, with email join)
      const { data: recentLogs } = await supabase
        .from('gemini_logs')
        .select('id, created_at, endpoint, model, status, latency_ms, user_id')
        .order('created_at', { ascending: false })
        .limit(100);

      const userEmailMap: Record<string, string> = {};
      for (const u of authUsers) userEmailMap[u.id] = u.email ?? '';

      const logs = (recentLogs ?? []).map((l) => ({
        ...l,
        user_email: l.user_id ? (userEmailMap[l.user_id] ?? null) : null,
      }));

      return res.status(200).json({
        stats: {
          total_users: authUsers.length,
          total_recipes: totalRecipes ?? 0,
          total_ai_calls: totalAiCalls ?? 0,
          calls_today: callsToday ?? 0,
          calls_this_week: callsThisWeek ?? 0,
          model_breakdown,
        },
        users,
        logs,
      });
    }

    // ── DELETE — remove a specific user ───────────────────────────────────────
    if (req.method === 'DELETE') {
      const adminId = await assertAdmin(req, res);
      if (!adminId) return;

      const targetUserId = req.query.userId as string;
      if (!targetUserId) return res.status(400).json({ error: 'userId required' });

      const supabase = getServerSupabase();
      await supabase.from('meal_plan').delete().eq('user_id', targetUserId);
      await supabase.from('shopping_list').delete().eq('user_id', targetUserId);
      await supabase.from('settings').delete().eq('user_id', targetUserId);
      await supabase.from('recipes').delete().eq('user_id', targetUserId);

      const { error } = await supabase.auth.admin.deleteUser(targetUserId);
      if (error) throw error;

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    captureException(err);
    const message = err instanceof Error ? err.message : 'Admin request failed';
    return res.status(500).json({ error: message });
  }
}
