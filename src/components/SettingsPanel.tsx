import { Settings, BarChart2, RefreshCw } from 'lucide-react';
import { useUsage } from '@/hooks/useUsage';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GeminiLogs } from '@/components/GeminiLogs';
import { MODEL_GROUPS } from '@/lib/constants';
import type { AppSettings } from '@/types';

type Tab = 'settings' | 'logs';

interface Props {
  isOpen: boolean;
  settings: AppSettings;
  isSaving: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
  userId?: string | null;
}

export function SettingsPanel({ isOpen, settings, isSaving, onClose, onSave, userId }: Props) {
  const [local, setLocal] = useState<AppSettings>(settings);
  const [tab, setTab] = useState<Tab>('settings');
  const { usage, loadingUsage, fetchUsage } = useUsage(userId);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLocal(settings); }, [settings, isOpen]);

  // Reset tab when closed
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!isOpen) setTab('settings'); }, [isOpen]);

  useEffect(() => { if (tab === 'logs') fetchUsage(); }, [tab, fetchUsage]);

  const hasChanges = JSON.stringify(local) !== JSON.stringify(settings);

  const handleSave = async () => {
    await onSave(local);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogTrigger className="hidden" />
      <DialogContent className="sm:max-w-[640px] h-[82vh] flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6 text-sk-primary" /> Settings
          </DialogTitle>
          <DialogDescription>Configure the Gemini AI model used for recipe extraction.</DialogDescription>
        </DialogHeader>

        {/* Tab switcher — fixed position, never moves */}
        <div className="shrink-0 flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 gap-1">
          <button
            onClick={() => setTab('settings')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'settings' ? 'bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            <Settings className="w-4 h-4" /> General
          </button>
          <button
            onClick={() => setTab('logs')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'logs' ? 'bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            <BarChart2 className="w-4 h-4" /> Usage Logs
          </button>
        </div>

        {/* Scrollable content area — fills remaining height */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === 'settings' && (
            <div className="space-y-6 py-2">
                <div className="space-y-2">
                  <Label className="font-semibold text-zinc-700 dark:text-zinc-300">Temperature Unit</Label>
                  <div className="flex gap-2">
                    {(['C', 'F'] as const).map((unit) => (
                      <button
                        key={unit}
                        onClick={() => setLocal((p) => ({ ...p, temperature_unit: unit }))}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                          local.temperature_unit === unit
                            ? 'bg-sk-primary border-sk-primary text-white dark:text-primary-foreground'
                            : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-sk-primary/40'
                        }`}
                      >
                        °{unit} — {unit === 'C' ? 'Celsius' : 'Fahrenheit'}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">All temperatures in recipes will be displayed in your preferred unit.</p>
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold text-zinc-700 dark:text-zinc-300">Gemini Model</Label>
                  <Select value={local.gemini_model} onValueChange={(v) => { if (v) setLocal((p) => ({ ...p, gemini_model: v })); }}>
                    <SelectTrigger aria-label="Gemini model" className="w-full"><SelectValue placeholder="Select model" /></SelectTrigger>
                    <SelectContent>
                      {MODEL_GROUPS.map((group) => (
                        <SelectGroup key={group.label}>
                          <SelectLabel className="text-xs text-zinc-400 font-bold uppercase tracking-wider">{group.label}</SelectLabel>
                          {group.models.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Lite is fastest and cheapest; Flash balances speed and quality; Pro is most accurate. Preview models are newer but may change.</p>
                </div>
              </div>
            )}

            {tab === 'logs' && (
              <div className="py-2 space-y-5">
                {/* Daily usage meter */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Today's AI usage</h3>
                    <button onClick={fetchUsage} disabled={loadingUsage} className="text-zinc-400 hover:text-sk-primary transition-colors disabled:opacity-50">
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingUsage ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  {usage ? (
                    <>
                      <div className="flex items-end gap-1.5">
                        <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{usage.used}</span>
                        <span className="text-sm text-zinc-400 dark:text-zinc-500 mb-1">/ {usage.limit} calls</span>
                        <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full mb-1 ${
                          usage.remaining === 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                          : usage.remaining < 20 ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                        }`}>
                          {usage.remaining} remaining
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            usage.used / usage.limit > 0.9 ? 'bg-red-500'
                            : usage.used / usage.limit > 0.7 ? 'bg-amber-400'
                            : 'bg-sk-primary dark:bg-primary'
                          }`}
                          style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }}
                        />
                      </div>
                      {usage.byEndpoint.length > 0 && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1">
                          {usage.byEndpoint.map(({ endpoint, count }) => (
                            <div key={endpoint} className="flex justify-between text-xs">
                              <span className="text-zinc-500 dark:text-zinc-400 font-mono">{endpoint}</span>
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">{count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Resets daily at midnight UTC.</p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-400">{loadingUsage ? 'Loading…' : 'No usage data yet.'}</p>
                  )}
                </div>

                <GeminiLogs />
              </div>
            )}
        </div>

        {/* Button area — always visible at bottom */}
        {tab === 'settings' && (
          <div className="shrink-0 bg-gradient-to-b from-transparent via-white via-50% to-white dark:via-zinc-900 dark:to-zinc-900 pt-4 pb-2 border-t border-zinc-100 dark:border-zinc-800 flex gap-3">
            <Button onClick={handleSave} disabled={!hasChanges || isSaving} className="flex-1 bg-sk-primary hover:bg-sk-primary-container disabled:bg-zinc-300 disabled:cursor-not-allowed text-white dark:text-primary-foreground font-semibold shadow-md py-3 text-base border-0 rounded-full">
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
