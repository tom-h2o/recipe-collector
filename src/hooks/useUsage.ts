import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { DAILY_LIMIT } from '../../api/_lib/rateLimit';

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
      const used = rows.length;

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
