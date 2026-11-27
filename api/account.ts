import { findShortcutLink } from '../shared/shortcutLink.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import {
  getServerSupabase, getUserId, getSettings, resolveApiKey, saveModelConfig, GLOBAL_SETTINGS_ID, isAdminUser,
  AI_TASK_IDS, OFFERED_MODELS, type AiTask,
} from './_lib/supabase.js';
import { captureException } from './_lib/sentry.js';
import { getGeminiClient } from './_lib/gemini.js';
import { configReport, reasoningReport, runLiveCheck, EXPECTED_SCHEMA, type UsageRow } from './_lib/systemCheck.js';
import { hashShortcutKey, newShortcutKey } from './_lib/shortcutImport.js';

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

/**
 * The iCloud link Apple's Shortcuts app makes with "Copy iCloud Link". Only
 * that: every user gets a button that opens this address, so it must not be
 * able to point anywhere else. An empty value removes the link.
 */

/** What the admin may set a report to (the CHECK on feedback.status). */
export const feedbackStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['new', 'seen', 'done']),
});

export const shortcutUrlSchema = z.object({
  // Empty or null removes the link. Anything else must contain an iCloud
  // Shortcut link, which is kept in its canonical form (shared/shortcutLink.ts):
  // a paste may carry the Shortcut's name or a query around it.
  url: z.string().nullable().transform((value, ctx) => {
    if (value === null || !value.trim()) return null;
    const link = findShortcutLink(value);
    if (!link) {
      ctx.addIssue({ code: 'custom', message: 'Paste the iCloud link from the Shortcuts app (it starts with https://www.icloud.com/shortcuts/).' });
      return z.NEVER;
    }
    return link;
  }),
  /** photos: "Send to Speisekammer" (0071). safari: "Save page to Speisekammer", pages and links (0072). */
  kind: z.enum(['photos', 'safari']).default('photos'),
}).strict();

/** The global settings column each shared Shortcut's link is kept in. */
export const SHORTCUT_URL_COLUMNS = { photos: 'shortcut_url', safari: 'safari_shortcut_url' } as const;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Throws unless the caller is the admin; returns their user id. See isAdminIdentity(). */
async function assertAdmin(authHeader: string | undefined): Promise<string> {
  const userId = await getUserId(authHeader);
  if (!userId) throw new HttpError(401, 'Unauthorized');
  if (!await isAdminUser(getServerSupabase(), userId)) throw new HttpError(403, 'Forbidden');
  return userId;
}

/**
 * Notes that this person opened the app today: one row per person per UTC
 * day, the date and nothing else (app_opens, migration 0075). Without it,
 * someone who only reads and cooks from their recipes never shows as active.
 * Never fails the request it rides on.
 */
export async function recordAppOpen(supabase: SupabaseClient, userId: string): Promise<void> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    await supabase.from('app_opens').upsert({ user_id: userId, day }, { onConflict: 'user_id,day', ignoreDuplicates: true });
  } catch {
    // Counting is a courtesy; answering whoami is not.
  }
}

/** The usage report's period, in days: what the Usage tab offers, clamped like the SQL. */
export function usageDays(raw: string | undefined): number {
  const days = parseInt(raw ?? '30', 10);
  return Number.isFinite(days) ? Math.min(90, Math.max(1, days)) : 30;
}

/** The least time between two live system checks. */
const HEALTH_CHECK_SPACING_MS = 60 * 1000;

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

const PHOTO_PATH_MARKER = '/storage/v1/object/public/recipe-images/';
const CHUNK = 100;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

function failIf(what: string, result: { error: { message?: string } | null }) {
  if (result.error) throw new Error(`Deleting ${what} failed: ${result.error.message ?? 'unknown error'}`);
}

/**
 * The photo files only this person uses. Their gallery rows name the files we
 * hold (storage_path), and so may their covers; a file still named by somebody
 * else stays, because copies point at the same file: a recipe someone accepted
 * from them, or one a linked account adopted.
 */
async function photosOnlyTheyUse(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const [gallery, covers] = await Promise.all([
    supabase.from('recipe_images').select('storage_path').eq('user_id', userId).not('storage_path', 'is', null),
    supabase.from('recipes').select('image_url').eq('user_id', userId).like('image_url', `%${PHOTO_PATH_MARKER}%`),
  ]);
  if (gallery.error) throw gallery.error;
  if (covers.error) throw covers.error;
  const paths = new Set<string>();
  for (const row of gallery.data ?? []) if (row.storage_path) paths.add(row.storage_path as string);
  for (const row of covers.data ?? []) {
    const path = String(row.image_url ?? '').split(PHOTO_PATH_MARKER)[1]?.split('?')[0];
    if (path) paths.add(decodeURIComponent(path));
  }
  if (paths.size === 0) return [];

  const shared = new Set<string>();
  for (const group of chunks([...paths])) {
    const { data, error } = await supabase.from('recipe_images').select('storage_path').in('storage_path', group).neq('user_id', userId);
    if (error) throw error;
    for (const row of data ?? []) shared.add(row.storage_path as string);
  }
  // Covers are stored as the public address the app made for the file, so
  // the same address finds every other recipe that shows it.
  const byUrl = new Map([...paths].map((path) => [supabase.storage.from('recipe-images').getPublicUrl(path).data.publicUrl, path]));
  for (const group of chunks([...byUrl.keys()])) {
    const { data, error } = await supabase.from('recipes').select('image_url').in('image_url', group).neq('user_id', userId);
    if (error) throw error;
    for (const row of data ?? []) {
      const path = byUrl.get(row.image_url as string);
      if (path) shared.add(path);
    }
  }
  return [...paths].filter((p) => !shared.has(p));
}

/**
 * Deletes an account and what it leaves behind. Every step is checked: this
 * used to ignore every error but the last, so a failed delete still answered
 * "ok" and left the person's data in place. Each step can be run again, so a
 * failure part-way is fixed by trying again.
 *
 * Beyond the account's own rows (many tables cascade from auth.users, the
 * ones without a cascade are deleted here): its photo files, which stayed
 * public in the bucket; its AI log rows, which hold the full text of what it
 * sent and got back; and recipes and invitations still waiting for its
 * address, which would otherwise be handed to whoever signs up with it next.
 */
export async function deleteUserData(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: found, error: findError } = await supabase.auth.admin.getUserById(userId);
  if (findError) throw findError;
  const email = found?.user?.email?.toLowerCase() ?? null;

  const photos = await photosOnlyTheyUse(supabase, userId);

  failIf('the meal plan', await supabase.from('meal_plan').delete().eq('user_id', userId));
  failIf('the shopping list', await supabase.from('shopping_list').delete().eq('user_id', userId));
  failIf('settings', await supabase.from('settings').delete().eq('user_id', userId));
  failIf('the AI log', await supabase.from('gemini_logs').delete().eq('user_id', userId));
  if (email) {
    failIf('recipes waiting for this address', await supabase.from('recipe_shares').delete().eq('recipient_email', email).eq('status', 'pending'));
    failIf('invitations to this address', await supabase.from('account_links').delete().eq('addressee_email', email).eq('status', 'pending'));
  }
  failIf('recipes', await supabase.from('recipes').delete().eq('user_id', userId));
  for (const group of chunks(photos)) {
    failIf('photos', await supabase.storage.from('recipe-images').remove(group));
  }

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
  if (error) throw error;
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
  if (error) throw error;

  const emailMap = await emailMapFor(supabase, (data ?? []).map((r) => r.user_id));
  const recipes = (data ?? []).map((r) => ({ ...r, user_email: r.user_id ? (emailMap[r.user_id] ?? null) : null }));

  return { recipes, total: count ?? 0 };
}

/**
 * Admin → Feedback: reports sent from the app (migration 0078), newest first,
 * one page at a time, with who sent each.
 */
async function getFeedbackPage(supabase: SupabaseClient, page: number, pageSize: number) {
  const { data, count, error } = await supabase
    .from('feedback')
    .select('id, created_at, user_id, kind, message, context, status', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  const emailMap = await emailMapFor(supabase, (data ?? []).map((r) => r.user_id));
  const feedback = (data ?? []).map((r) => ({ ...r, user_email: emailMap[r.user_id] ?? null }));
  return { feedback, total: count ?? 0 };
}

/**
 * How many reports nobody has looked at, for the badge on the Feedback tab.
 * A failure costs the badge, not the dashboard (also the minutes after a
 * deploy, before the migration job has made the table).
 */
async function countNewFeedback(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase.from('feedback').select('id', { count: 'exact', head: true }).eq('status', 'new');
  if (error) {
    console.warn('Counting new feedback failed:', error.message);
    return 0;
  }
  return count ?? 0;
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
  if (error) throw error;

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
    // ── The iPhone Shortcut key — any signed-in user, their own key only ──────
    // Handled first and only on these exact tab/action values, so nothing here
    // can fall through to the admin routes or to DELETE (account deletion).
    // The key is shown once on creation; only its hash is stored.
    const shortcutRoute = req.method === 'GET' && queryParam(req, 'tab') === 'shortcut-key'
      ? 'status'
      : req.method === 'POST' && queryParam(req, 'action') === 'shortcut-key'
        ? 'create'
        : req.method === 'POST' && queryParam(req, 'action') === 'shortcut-key-revoke'
          ? 'revoke'
          : null;
    if (shortcutRoute) {
      const userId = await getUserId(auth);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const supabase = getServerSupabase();
      if (shortcutRoute === 'status') {
        const { data, error } = await supabase.from('shortcut_keys').select('created_at, last_used_at').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        return res.status(200).json({ hasKey: !!data, created_at: data?.created_at ?? null, last_used_at: data?.last_used_at ?? null });
      }
      if (shortcutRoute === 'create') {
        // A new key replaces the old one, which stops working at once.
        const key = newShortcutKey();
        const created_at = new Date().toISOString();
        const { error } = await supabase
          .from('shortcut_keys')
          .upsert({ user_id: userId, key_hash: hashShortcutKey(key), created_at, last_used_at: null }, { onConflict: 'user_id' });
        if (error) throw error;
        return res.status(200).json({ key, created_at });
      }
      const { error } = await supabase.from('shortcut_keys').delete().eq('user_id', userId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    // ── GET /api/account?tab=whoami — any signed-in user: am I the admin? ─────
    // The app asks rather than comparing an address compiled into its code:
    // that put the admin's address in every visitor's browser.
    // It is also the one call every signed-in load makes, so it records the
    // day the app was opened, for the admin's Usage tab (migration 0075).
    if (req.method === 'GET' && queryParam(req, 'tab') === 'whoami') {
      const userId = await getUserId(auth);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const supabase = getServerSupabase();
      await recordAppOpen(supabase, userId);
      return res.status(200).json({ isAdmin: await isAdminUser(supabase, userId) });
    }

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
        const [stats, new_feedback] = await Promise.all([getStats(supabase), countNewFeedback(supabase)]);
        return res.status(200).json({ stats: { ...stats, new_feedback } });
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

      if (tab === 'feedback') {
        const { page, pageSize } = parsePageParams(req);
        const { feedback, total } = await getFeedbackPage(supabase, page, pageSize);
        return res.status(200).json({ feedback, total });
      }

      if (tab === 'health') {
        return res.status(200).json(await getHealthOverview(supabase, adminId));
      }

      // Counted in the database by admin_usage() (migration 0075): fetching
      // rows to count them would stop at the API's 1000-row limit.
      if (tab === 'usage') {
        const { data, error } = await supabase.rpc('admin_usage', { p_days: usageDays(queryParam(req, 'days')) });
        if (error) {
          // The minutes after a deploy, before the migration job has run.
          if (error.code === 'PGRST202' || /admin_usage/.test(error.message ?? '')) {
            return res.status(503).json({ error: 'The usage report needs the latest database migration. Try again in a few minutes.' });
          }
          throw error;
        }
        return res.status(200).json({ usage: data });
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
      // Each run is a paid call per model, outside the daily allowance (it is
      // logged as health-check), so runs are spaced out rather than unlimited.
      const since = new Date(Date.now() - HEALTH_CHECK_SPACING_MS).toISOString();
      const { count: recent, error: recentError } = await supabase.from('gemini_logs').select('id', { count: 'exact', head: true }).eq('endpoint', 'health-check').gte('created_at', since);
      if (recentError) throw recentError;
      if ((recent ?? 0) > 0) return res.status(429).json({ error: 'The check ran less than a minute ago. Please wait a moment before running it again.' });
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

    // ── POST /api/account?action=feedback-status — admin: new / seen / done ───
    // People cannot change a report they sent (no update policy, 0078); the
    // admin's handling of it goes through the service key here.
    if (req.method === 'POST' && queryParam(req, 'action') === 'feedback-status') {
      await assertAdmin(auth);
      const parsed = feedbackStatusSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: 'Invalid feedback status' });
      const { data, error } = await getServerSupabase()
        .from('feedback')
        .update({ status: parsed.data.status })
        .eq('id', parsed.data.id)
        .select('id');
      if (error) throw error;
      if (!data?.length) return res.status(404).json({ error: 'Report not found' });
      return res.status(200).json(parsed.data);
    }

    // ── POST /api/account?action=shortcut-url — admin: a shared Shortcut ──────
    // Stored on the global settings row (migrations 0071, 0072), which every
    // user reads to show an "Add to Shortcuts" button for each Shortcut.
    if (req.method === 'POST' && queryParam(req, 'action') === 'shortcut-url') {
      await assertAdmin(auth);
      const parsed = shortcutUrlSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid link' });
      }
      const url = parsed.data.url || null;
      const { kind } = parsed.data;
      const { error } = await getServerSupabase()
        .from('settings')
        .upsert({ id: GLOBAL_SETTINGS_ID, user_id: null, [SHORTCUT_URL_COLUMNS[kind]]: url }, { onConflict: 'id' });
      if (error) throw error;
      return res.status(200).json({ url, kind });
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

      if (error) throw error;
      if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

      return res.status(200).json({ recipe });
    }

    // ── DELETE /api/account — delete own account or (admin) any user ──────────
    if (req.method === 'DELETE') {
      const targetUserId = req.query.userId as string | undefined;

      if (targetUserId) {
        await assertAdmin(auth);
        await deleteUserData(getServerSupabase(), targetUserId);
      } else {
        const userId = await getUserId(auth);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        await deleteUserData(getServerSupabase(), userId);
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    captureException(err);
    console.error('Account error:', err);
    // Never the raw message: a database error names tables and constraints.
    return res.status(500).json({ error: 'Request failed.' });
  }
}
