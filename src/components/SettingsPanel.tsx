import { Settings, BarChart2, RefreshCw, Link2 } from 'lucide-react';
import { useUsage } from '@/hooks/useUsage';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GeminiLogs } from '@/components/GeminiLogs';
import { ConnectionsPanel } from '@/components/ConnectionsPanel';
import { useAccountLinks } from '@/hooks/useAccountLinks';
import { MODEL_OPTIONS, AI_TASKS, RECOMMENDED_TASK_MODELS } from '@/lib/constants';
import type { AppSettings, AiTask } from '@/types';

type Tab = 'settings' | 'connections' | 'logs';

interface Props {
  isOpen: boolean;
  settings: AppSettings;
  isSaving: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
  userId?: string | null;
  userEmail?: string | null;
}

export function SettingsPanel({ isOpen, settings, isSaving, onClose, onSave, userId, userEmail }: Props) {
  const {
    connected, pendingIncoming, pendingOutgoing, busy: linksBusy,
    fetchLinks, invite, accept, disconnect, rename,
  } = useAccountLinks(userId, userEmail);
  const [local, setLocal] = useState<AppSettings>(settings);
  const [tab, setTab] = useState<Tab>('settings');
  const { usage, loadingUsage, fetchUsage } = useUsage(userId);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLocal(settings); }, [settings, isOpen]);

  // Reset tab when closed
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!isOpen) setTab('settings'); }, [isOpen]);

  useEffect(() => { if (tab === 'logs') fetchUsage(); }, [tab, fetchUsage]);
  useEffect(() => { if (tab === 'connections') fetchLinks(); }, [tab, fetchLinks]);

  const hasChanges = JSON.stringify(local) !== JSON.stringify(settings);

  const handleSave = async () => {
    await onSave(local);
    onClose();
  };

  const setTaskModel = (task: AiTask, model: string | null) =>
    setLocal((p) => {
      const next = { ...(p.task_models ?? {}) };
      // An empty selection means "follow the main model" — store nothing rather
      // than a copy of it, so changing the main model still moves this task.
      if (model) next[task] = model;
      else delete next[task];
      return { ...p, task_models: next };
    });

  const mainModelName = MODEL_OPTIONS.find((m) => m.id === local.gemini_model)?.name ?? local.gemini_model;
  const overrideCount = Object.keys(local.task_models ?? {}).length;
  const usingRecommended =
    JSON.stringify(local.task_models ?? {}) === JSON.stringify(RECOMMENDED_TASK_MODELS);

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
            onClick={() => setTab('connections')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'connections' ? 'bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            <Link2 className="w-4 h-4" /> Connections
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
                    <SelectTrigger aria-label="Gemini model" className="w-full h-auto min-h-9 py-1.5">
                      {/* An explicit label: without it the trigger renders the
                          selected item's entire block — description and price
                          included — inside a fixed-height, nowrap box. */}
                      <SelectValue placeholder="Select model">
                        {(value: string) => {
                          const m = MODEL_OPTIONS.find((o) => o.id === value);
                          if (!m) return 'Select model';
                          return (
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold shrink-0">{m.name}</span>
                              <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{m.id}</span>
                            </span>
                          );
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <div className="flex flex-col gap-0.5 py-0.5 max-w-[26rem]">
                            <span className="flex items-center gap-2 font-semibold">
                              {m.name}
                              {m.badge && (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-sk-surface-high dark:bg-muted text-sk-on-surface-variant dark:text-muted-foreground">
                                  {m.badge}
                                </span>
                              )}
                              <span className="text-[11px] font-normal text-zinc-600 dark:text-zinc-400">{m.id}</span>
                            </span>
                            <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400 whitespace-normal">{m.description}</span>
                            <span className="text-[11px] font-normal text-zinc-600 dark:text-zinc-400">{m.price}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Used by every task that has no model of its own below.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Label className="font-semibold text-zinc-700 dark:text-zinc-300">Model per task</Label>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                        Reading a photographed page is far harder than tagging a recipe you already have.
                        Put the cheap tasks on Lite and keep extraction on a stronger model.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => setLocal((p) => ({ ...p, task_models: { ...RECOMMENDED_TASK_MODELS } }))}
                      disabled={usingRecommended}
                      className="shrink-0 h-8 px-3 text-xs rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border-0 disabled:opacity-40"
                    >
                      Use recommended
                    </Button>
                  </div>

                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
                    {AI_TASKS.map((t) => (
                      <div key={t.task} className="p-3 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t.label}</p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400">{t.description}</p>
                        </div>
                        <Select
                          value={local.task_models?.[t.task] ?? ''}
                          onValueChange={(v) => setTaskModel(t.task, v === '' ? null : (v as string))}
                        >
                          <SelectTrigger aria-label={`Model for ${t.label}`} className="w-[11rem] shrink-0">
                            <SelectValue placeholder="Same as main">
                              {(value: string) => (
                                <span className="truncate">
                                  {value ? (MODEL_OPTIONS.find((o) => o.id === value)?.name ?? value) : 'Same as main'}
                                </span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">
                              <span className="text-sm">Same as main ({mainModelName})</span>
                            </SelectItem>
                            {MODEL_OPTIONS.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                <span className="text-sm">
                                  {m.name}
                                  {m.id === t.recommended && (
                                    <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-sk-on-surface-variant dark:text-muted-foreground">
                                      suggested
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {overrideCount === 0
                      ? `Every task uses the main model (${mainModelName}).`
                      : `${overrideCount} of ${AI_TASKS.length} tasks have their own model.`}
                  </p>
                </div>
              </div>
            )}

            {tab === 'connections' && (
              <ConnectionsPanel
                connected={connected}
                pendingIncoming={pendingIncoming}
                pendingOutgoing={pendingOutgoing}
                busy={linksBusy}
                onInvite={invite}
                onAccept={accept}
                onDisconnect={disconnect}
                onRename={rename}
              />
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
