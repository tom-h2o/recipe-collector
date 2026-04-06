import { useEffect, useState } from 'react';
import { RefreshCw, ChevronDown, ChevronRight, CheckCircle, XCircle, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface GeminiLog {
  id: string;
  created_at: string;
  endpoint: string;
  model: string;
  status: 'success' | 'error';
  latency_ms: number | null;
  input: string | null;
  output: string | null;
  input_preview?: string | null;
  output_preview?: string | null;
  error_message: string | null;
  recipe_id: string | null;
}

const ENDPOINT_COLORS: Record<string, string> = {
  extract:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  tag:       'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  nutrition: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  suggest:   'bg-sk-primary-fixed/40 text-sk-primary',
  shopping:  'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function GeminiLogs() {
  const [logs, setLogs] = useState<GeminiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function fetchLogs() {
    setLoading(true);
    const { data } = await supabase
      .from('gemini_logs')
      .select('id, created_at, endpoint, model, status, latency_ms, input, output, error_message, recipe_id')
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setLogs(data as GeminiLog[]);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchLogs(); }, []);

  const successCount = logs.filter((l) => l.status === 'success').length;
  const successRate = logs.length > 0 ? Math.round((successCount / logs.length) * 100) : 100;
  const avgLatency = logs.length > 0
    ? Math.round(logs.filter((l) => l.latency_ms).reduce((sum, l) => sum + (l.latency_ms ?? 0), 0) / logs.filter((l) => l.latency_ms).length)
    : 0;

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">
            <span className="font-bold text-zinc-900 dark:text-zinc-100">{logs.length}</span> calls
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">
            <span className={`font-bold ${successRate >= 90 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{successRate}%</span> success
          </span>
          {avgLatency > 0 && (
            <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-bold text-zinc-900 dark:text-zinc-100">{avgLatency > 1000 ? `${(avgLatency / 1000).toFixed(1)}s` : `${avgLatency}ms`}</span> avg
            </span>
          )}
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-10 text-zinc-400 dark:text-zinc-600 text-sm">
          No API calls yet. Extract a recipe to see logs here.
        </div>
      ) : (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_100px_60px_48px] gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            <span>Time</span>
            <span>Endpoint</span>
            <span>Model</span>
            <span>Status</span>
            <span className="text-right">ms</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 max-h-[380px] overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id}>
                <button
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className="w-full grid grid-cols-[1fr_80px_100px_60px_48px] gap-2 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left items-center"
                >
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {expandedId === log.id
                      ? <ChevronDown className="w-3 h-3 shrink-0" />
                      : <ChevronRight className="w-3 h-3 shrink-0 text-zinc-300 dark:text-zinc-600" />
                    }
                    {relativeTime(log.created_at)}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md w-fit ${ENDPOINT_COLORS[log.endpoint] ?? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600'}`}>
                    {log.endpoint}
                  </span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate font-mono">
                    {log.model.replace('gemini-', '')}
                  </span>
                  <span>
                    {log.status === 'success'
                      ? <CheckCircle className="w-4 h-4 text-green-500" />
                      : <XCircle className="w-4 h-4 text-red-500" />
                    }
                  </span>
                  <span className="text-right text-xs font-mono text-zinc-400">
                    {log.latency_ms ?? '—'}
                  </span>
                </button>

                {expandedId === log.id && (
                  <div className="px-3 pb-3 pt-1 space-y-2 bg-zinc-50 dark:bg-zinc-900/70 border-t border-zinc-100 dark:border-zinc-800 max-h-96 overflow-y-auto">
                    {log.input && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Input Prompt</p>
                        <pre className="text-xs text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 whitespace-pre-wrap break-words font-mono leading-relaxed">
                          {log.input}
                        </pre>
                      </div>
                    )}
                    {log.output && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Output Response</p>
                        <pre className="text-xs text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 whitespace-pre-wrap break-words font-mono leading-relaxed">
                          {log.output}
                        </pre>
                      </div>
                    )}
                    {log.error_message && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-1">Error</p>
                        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-2">
                          {log.error_message}
                        </p>
                      </div>
                    )}
                    {log.recipe_id && (
                      <p className="text-[10px] text-zinc-400 font-mono">recipe_id: {log.recipe_id}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
