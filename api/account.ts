import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getUserId } from './_lib/supabase.js';
import { captureException } from './_lib/sentry.js';

const ADMIN_EMAIL = process.env.VITE_ADMIN_EMAIL ?? '';

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function assertAdmin(authHeader: string | undefined): Promise<void> {
  const userId = await getUserId(authHeader);
  if (!userId) throw new HttpError(401, 'Unauthorized');
  const supabase = getServerSupabase();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new HttpError(403, error?.message || 'Forbidden');
  if (data.user.email !== ADMIN_EMAIL) throw new HttpError(403, 'Forbidden');
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

  const auth = req.headers.authorization as string | undefined;

  try {
    // ── GET /api/account?recipeId=… — admin: open one user's full recipe ──────
    // The dashboard payload only carries card-level fields; this returns the
    // full row (ingredients, instructions, nutrition) for the viewer.
    if (req.method === 'GET' && req.query.recipeId) {
      await assertAdmin(auth);

      const recipeId = req.query.recipeId as string;
      const supabase = getServerSupabase();
      const { data: recipe, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', recipeId)
        .single();

      if (error || !recipe) return res.status(404).json({ error: 'Recipe not found' });

      let user_email: string | null = null;
      if (recipe.user_id) {
        const { data: owner } = await supabase.auth.admin.getUserById(recipe.user_id);
        user_email = owner?.user?.email ?? null;
      }

      return res.status(200).json({ recipe, user_email });
    }

    // ── GET /api/account — admin dashboard ────────────────────────────────────
    if (req.method === 'GET') {
      await assertAdmin(auth);

      const supabase = getServerSupabase();
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (listError || !listData?.users) {
        return res.status(500).json({ error: listError?.message || 'Failed to list users' });
      }
      const authUsers = listData.users;

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

    // ── PATCH /api/account?recipeId=… — admin: edit any user's recipe ─────────
    // RLS (recipes_update) restricts the browser client to the owner's own rows,
    // so admin edits have to go through the service key here.
    if (req.method === 'PATCH' && req.query.recipeId) {
      await assertAdmin(auth);

      const recipeId = req.query.recipeId as string;
      const body = (req.body ?? {}) as Record<string, unknown>;

      // Whitelist — never let a request rewrite user_id, id, or created_at
      const EDITABLE = [
        'title', 'description', 'ingredients', 'instructions', 'image_url',
        'servings', 'prep_time_mins', 'cook_time_mins',
        'source_url', 'source_name', 'original_language',
      ] as const;

      const updates: Record<string, unknown> = {};
      for (const field of EDITABLE) {
        if (body[field] !== undefined) updates[field] = body[field];
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No editable fields supplied' });
      }

      const supabase = getServerSupabase();
      const { data: recipe, error } = await supabase
        .from('recipes')
        .update(updates)
        .eq('id', recipeId)
        .select('*')
        .single();

      if (error) return res.status(500).json({ error: error.message });
      if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

      return res.status(200).json({ recipe });
    }

    // ── DELETE /api/account — delete own account or (admin) any user ──────────
    if (req.method === 'DELETE') {
      const targetUserId = req.query.userId as string | undefined;

      if (targetUserId) {
        await assertAdmin(auth);
        await deleteUserData(targetUserId);
      } else {
        const userId = await getUserId(auth);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        await deleteUserData(userId);
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    captureException(err);
    const message = err instanceof Error ? err.message : 'Request failed';
    return res.status(500).json({ error: message });
  }
}
