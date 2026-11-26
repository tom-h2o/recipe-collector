import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { DAILY_LIMIT, NON_AI_ENDPOINTS } from '../../shared/usage';

export interface UsageStats {
  used: number;
  limit: number;
  remaining: number;
  byEndpoint: { endpoint: string; count: number }[];
}

export function useUsage(userId?: string | null) {
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const fetchUsage = useCallback(async () => {
    if (!userId) return;
    setLoadingUsage(true);
    try {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const { data } = await supabase
        .from('gemini_logs')
        .select('endpoint')
        .eq('user_id', userId)
        .gte('created_at', todayStart.toISOString());

      const rows = data ?? [];
      // The total is what the server enforces: today's row in ai_usage, which
      // each call takes from before it runs (migration 0074). The log only
      // gets its row once the answer is in, so during a call it lagged. Until
      // the first call of the day there is no row, which means none used; if
      // the table cannot be read, the log's count stands in, without the
      // endpoints that never counted.
      const today = todayStart.toISOString().slice(0, 10);
      const counter = await supabase
        .from('ai_usage')
        .select('used')
        .eq('user_id', userId)
        .eq('day', today)
        .eq('bucket', 'ai')
        .maybeSingle();
      const used = !counter.error
        ? Number(counter.data?.used ?? 0)
        : rows.filter((r) => !(NON_AI_ENDPOINTS as readonly string[]).includes(r.endpoint)).length;

      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.endpoint] = (counts[r.endpoint] ?? 0) + 1;
      const byEndpoint = Object.entries(counts)
        .map(([endpoint, count]) => ({ endpoint, count }))
        .sort((a, b) => b.count - a.count);

      setUsage({ used, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - used), byEndpoint });
    } finally {
      setLoadingUsage(false);
    }
  }, [userId]);

  return { usage, loadingUsage, fetchUsage };
}
