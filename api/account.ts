import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import {
  getServerSupabase, getUserId, getSettings, resolveApiKey, saveModelConfig,
  AI_TASK_IDS, OFFERED_MODELS, type AiTask,
} from './_lib/supabase.js';
import { captureException } from './_lib/sentry.js';
import { getGeminiClient } from './_lib/gemini.js';
import { configReport, reasoningReport, runLiveCheck, EXPECTED_SCHEMA, type UsageRow } from './_lib/systemCheck.js';

const ADMIN_EMAIL = process.env.VITE_ADMIN_EMAIL ?? '';
const MAX_PAGE_SIZE = 100;

/**
 * POST /api/account?action=models — the admin's model choice for everyone.
 * Only ids the app offers: a typo here would fail every AI call in the app,
 * and nothing else stands between this body and the global settings row.
 * Kept here rather than in _lib/schemas.ts because it is built from
 * supabase.ts's constants, and every endpoint test mocks that module.
 */
const offeredModel = z.enum(OFFERED_MODELS as [string, ...string[]], { error: 'Not a model this app offers' });

export const modelConfigSchema = z.object({
  gemini_model: offeredModel,
  task_models: z.partialRecord(z.enum(AI_TASK_IDS as [AiTask, ...AiTask[]]), offeredModel),
}).strict();

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Throws unless the caller is the admin; returns their user id. */
async function assertAdmin(authHeader: string | undefined): Promise<string> {
  const userId = await getUserId(authHeader);
  if (!userId) throw new HttpError(401, 'Unauthorized');
  const supabase = getServerSupabase();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new HttpError(403, error?.message || 'Forbidden');
  // An unset ADMIN_EMAIL must never match an account with no email.
  if (!ADMIN_EMAIL || data.user.email !== ADMIN_EMAIL) throw new HttpError(403, 'Forbidden');
  return userId;
}

/** Seven days: long enough to see every task used, short enough to reflect a change. */
const REASONING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The free half of the System tab: configuration (set or missing, never a
 * value) and reasoning per task, configured and as logged. No external calls.
 */
export async function getHealthOverview(supabase: SupabaseClient, adminId: string) {
  const since = new Date(Date.now() - REASONING_WINDOW_MS).toISOString();
  const [settings, usage] = await Promise.all([
    getSettings(supabase, adminId),
    supabase.rpc('gemini_thinking_usage', { since }),
  ]);
  // Missing in the minutes before migration 0067 runs: the configured column
  // still shows, the evidence column says it is unavailable.
  if (usage.error) console.error('Reasoning usage unavailable:', usage.error);
  return {
    config: configReport(),
    expected_schema: EXPECTED_SCHEMA,
    reasoning: {
      since,
      usage_available: !usage.error,
      tasks: reasoningReport(settings, usage.error ? null : (usage.data as UsageRow[])),
    },
  };
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

function queryParam(req: VercelRequest, key: string): string | undefined {
  const raw = req.query[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function parsePageParams(req: VercelRequest): { page: number; pageSize: number } {
  const page = Math.max(0, parseInt(queryParam(req, 'page') ?? '0', 10) || 0);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(queryParam(req, 'pageSize') ?? '25', 10) || 25));
  return { page, pageSize };
}

// Bounded to the user ids present on the current page — never scans the full user table.
async function emailMapFor(supabase: SupabaseClient, userIds: (string | null)[]): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(userIds.filter((id): id is string => !!id))];
  const entries = await Promise.all(uniqueIds.map(async (id) => {
    const { data } = await supabase.auth.admin.getUserById(id);
    return [id, data?.user?.email ?? ''] as const;
  }));
  return Object.fromEntries(entries);
}

export async function getStats(supabase: SupabaseClient) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [userCountRes, totalRecipesRes, totalAiCallsRes, callsTodayRes, callsThisWeekRes, modelUsageRes] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1 }),
    supabase.from('recipes').select('*', { count: 'exact', head: true }),
    supabase.from('gemini_logs').select('*', { count: 'exact', head: true }),
    supabase.from('gemini_logs').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
    supabase.from('gemini_logs').select('*', { count: 'exact', head: true }).gte('created_at', weekStart),
    supabase.rpc('gemini_model_usage'),
  ]);

  // Counted in the database (migration 0066), grouped by the model that
  // actually ran rather than the id that was requested. This used to select
  // every row and tally them here, which was not just unbounded but wrong: the
  // API returns at most 1000 rows per request, silently, so past a thousand
  // logged calls the chart counted an arbitrary thousand of them while
  // total_ai_calls beside it showed the real figure.
  //
  // A failure here costs the chart, not the page — which is also what happens
  // in the minutes after a deploy, before the migration job has created the
  // function.
  if (modelUsageRes.error) {
    captureException(modelUsageRes.error);
    console.error('Model usage breakdown failed:', modelUsageRes.error);
  }
  const usageRows = (modelUsageRes.data ?? []) as { model: string; call_count: number | string }[];
  // Already ordered by count; bigint can arrive as a string.
  const model_breakdown = usageRows.map((r) => ({ model: r.model, count: Number(r.call_count) }));

  const totalUsers = (userCountRes.data as { total?: number } | null)?.total ?? 0;

  return {
    total_users: totalUsers,
    total_recipes: totalRecipesRes.count ?? 0,
    total_ai_calls: totalAiCallsRes.count ?? 0,
    calls_today: callsTodayRes.count ?? 0,
    calls_this_week: callsThisWeekRes.count ?? 0,
    model_breakdown,
  };
}

// Per-user head-only counts, bounded to the page of users being displayed —
// avoids downloading every recipes/gemini_logs row just to tally them in JS.
async function getUsersPage(supabase: SupabaseClient, page: number, pageSize: number) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: page + 1, perPage: pageSize });
  if (error) throw new HttpError(500, error.message);
  const authUsers = data.users;
  const total = (data as { total?: number }).total ?? authUsers.length;

  const counts = await Promise.all(authUsers.map(async (u) => {
    const [recipeCountRes, aiCountRes] = await Promise.all([
      supabase.from('recipes').select('*', { count: 'exact', head: true }).eq('user_id', u.id),
      supabase.from('gemini_logs').select('*', { count: 'exact', head: true }).eq('user_id', u.id),
    ]);
    return { recipe_count: recipeCountRes.count ?? 0, ai_call_count: aiCountRes.count ?? 0 };
  }));

  const users = authUsers.map((u, i) => ({
    id: u.id,
    email: u.email ?? '',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    recipe_count: counts[i].recipe_count,
    ai_call_count: counts[i].ai_call_count,
  }));

  return { users, total };
}

async function getRecipesPage(supabase: SupabaseClient, page: number, pageSize: number, search: string | undefined, ownerId: string | undefined) {
  let query = supabase
    .from('recipes')
    .select('id, title, description, image_url, tags, created_at, user_id, is_favourite, servings, prep_time_mins, cook_time_mins', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (search) query = query.ilike('title', `%${search}%`);
  if (ownerId) query = query.eq('user_id', ownerId);

  const { data, count, error } = await query;
  if (error) throw new HttpError(500, error.message);

  const emailMap = await emailMapFor(supabase, (data ?? []).map((r) => r.user_id));
  const recipes = (data ?? []).map((r) => ({ ...r, user_email: r.user_id ? (emailMap[r.user_id] ?? null) : null }));

  return { recipes, total: count ?? 0 };
}

const LOG_COLUMNS = 'id, created_at, endpoint, model, model_version, status, latency_ms, user_id';

async function getLogsPage(supabase: SupabaseClient, page: number, pageSize: number) {
  const fetchPage = (columns: string) => supabase
    .from('gemini_logs')
    .select(columns, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  let { data, count, error } = await fetchPage(`${LOG_COLUMNS}, thinking`);
  // Code is live a few minutes before the migration job adds `thinking`
  // (0067); the tab shows the rows without it rather than failing.
  if (error && /thinking/i.test(error.message)) ({ data, count, error } = await fetchPage(LOG_COLUMNS));
  if (error) throw new HttpError(500, error.message);

  // The column list is a variable, so supabase-js cannot infer the row shape.
  const rows = (data ?? []) as unknown as { user_id: string | null }[];
  const emailMap = await emailMapFor(supabase, rows.map((l) => l.user_id));
  const logs = rows.map((l) => ({ ...l, user_email: l.user_id ? (emailMap[l.user_id] ?? null) : null }));

  return { logs, total: count ?? 0 };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers.authorization as string | undefined;

  try {
    // ── GET /api/account?recipeId=… — admin: open one user's full recipe ──────
    // The paginated dashboard only carries card-level fields; this returns the
    // full row (ingredients, instructions, nutrition) for the viewer.
    const viewRecipeId = queryParam(req, 'recipeId');
    if (req.method === 'GET' && viewRecipeId) {
      await assertAdmin(auth);

      const supabase = getServerSupabase();
      const { data: recipe, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', viewRecipeId)
        .single();

      if (error || !recipe) return res.status(404).json({ error: 'Recipe not found' });

      let user_email: string | null = null;
      if (recipe.user_id) {
        const { data: owner } = await supabase.auth.admin.getUserById(recipe.user_id);
        user_email = owner?.user?.email ?? null;
      }

      return res.status(200).json({ recipe, user_email });
    }

    // ── GET /api/account — admin dashboard, paginated per tab ─────────────────
    if (req.method === 'GET') {
      const adminId = await assertAdmin(auth);
      const supabase = getServerSupabase();
      const tab = queryParam(req, 'tab') ?? 'overview';

      if (tab === 'overview') {
        const stats = await getStats(supabase);
        return res.status(200).json({ stats });
      }

      if (tab === 'users') {
        const { page, pageSize } = parsePageParams(req);
        const { users, total } = await getUsersPage(supabase, page, pageSize);
        return res.status(200).json({ users, total });
      }

      if (tab === 'recipes') {
        const { page, pageSize } = parsePageParams(req);
        const search = queryParam(req, 'search')?.trim() || undefined;
        const ownerId = queryParam(req, 'userId') || undefined;
        const { recipes, total } = await getRecipesPage(supabase, page, pageSize, search, ownerId);
        return res.status(200).json({ recipes, total });
      }

      if (tab === 'logs') {
        const { page, pageSize } = parsePageParams(req);
        const { logs, total } = await getLogsPage(supabase, page, pageSize);
        return res.status(200).json({ logs, total });
      }

      if (tab === 'health') {
        return res.status(200).json(await getHealthOverview(supabase, adminId));
      }

      return res.status(400).json({ error: 'Invalid tab' });
    }

    // ── POST /api/account?action=health-check — admin: run the live checks ────
    // A POST, not part of the GET above, because it costs something: one small
    // Gemini call per model, an embedding and an Unsplash search. The System
    // tab sends it only when the admin presses "Run check". The calls are
    // logged as health-check, which NON_AI_ENDPOINTS keeps out of the limit.
    if (req.method === 'POST' && queryParam(req, 'action') === 'health-check') {
      const adminId = await assertAdmin(auth);
      const supabase = getServerSupabase();
      const apiKey = resolveApiKey(await getSettings(supabase, adminId));
      const report = await runLiveCheck({ supabase, client: apiKey ? getGeminiClient(apiKey) : null, userId: adminId });
      return res.status(200).json(report);
    }

    // ── POST /api/account?action=models — admin: the models everyone runs on ──
    // The only way to change them. Users read the result from the global
    // settings row (RLS lets them select it, never write it) to see which model
    // each task runs on; getSettings() reads nothing else for models.
    if (req.method === 'POST' && queryParam(req, 'action') === 'models') {
      await assertAdmin(auth);
      const parsed = modelConfigSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid model configuration' });
      }
      const saved = await saveModelConfig(getServerSupabase(), parsed.data);
      return res.status(200).json(saved);
    }

    // ── PATCH /api/account?recipeId=… — admin: edit any user's recipe ─────────
    // RLS (recipes_update) restricts the browser client to the owner's own rows,
    // so admin edits have to go through the service key here.
    if (req.method === 'PATCH' && viewRecipeId) {
      await assertAdmin(auth);

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
        .eq('id', viewRecipeId)
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
