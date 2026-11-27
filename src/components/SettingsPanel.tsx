import { Settings, BarChart2, RefreshCw, Link2, Sparkles } from 'lucide-react';
import { useUsage } from '@/hooks/useUsage';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GeminiLogs } from '@/components/GeminiLogs';
import { ConnectionsPanel } from '@/components/ConnectionsPanel';
import { ShortcutSettings } from '@/components/ShortcutSettings';
import { SegmentedTabs, type SegmentedTab } from '@/components/SegmentedTabs';
import { useAccountLinks } from '@/hooks/useAccountLinks';
import { useModelResolution } from '@/hooks/useModelResolution';
import { MODEL_OPTIONS, AI_TASKS, RECOMMENDED_TASK_MODELS } from '@/lib/constants';
import type { AppSettings, AiTask } from '@/types';
import { UI_LANGUAGES, dateLocale, msg, useLanguagePreference, useT, type LanguagePreference } from '@/i18n';

type Tab = 'settings' | 'ai' | 'connections' | 'logs';

const TABS: readonly SegmentedTab<Tab>[] = [
  { id: 'settings', label: msg('General'), icon: Settings },
  // "AI" on a phone, where four labels have to share one row.
  { id: 'ai', label: msg('AI models'), short: msg('AI'), icon: Sparkles },
  // German's "Verknüpfungen" pushed the fourth tab off a phone's row.
  { id: 'connections', label: msg('Connections'), short: msg('Connections##phone tab'), icon: Link2 },
  { id: 'logs', label: msg('Usage'), icon: BarChart2 },
];

interface Props {
  isOpen: boolean;
  settings: AppSettings;
  isSaving: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
  /**
   * The admin chooses the AI models for everyone; anyone else sees which model
   * each task runs on, read-only. Hiding the controls is the courtesy, not the
   * guard: the server refuses a model change from anyone but the admin.
   */
  isAdmin?: boolean;
  userId?: string | null;
  userEmail?: string | null;
}

/**
 * What each model id has actually been running as. An alias hides the real
 * model, and Google moves them without notice — the only trustworthy answer
 * comes from calls that happened.
 */
function ModelResolutionList({ ids, resolutionFor }: { ids: string[]; resolutionFor: ReturnType<typeof useModelResolution>['resolutionFor'] }) {
  const t = useT();
  return (
    <>
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 mt-3">
        {ids.map((id) => {
          const r = resolutionFor(id);
          const isAlias = id.endsWith('-latest');
          return (
            <div key={id} className="px-3 py-2 flex items-baseline justify-between gap-3 text-xs">
              <span className="font-mono text-zinc-600 dark:text-zinc-400 truncate">
                {id}
                {isAlias && (
                  <span className="ml-1.5 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-500">{t('alias')}</span>
                )}
              </span>
              {r ? (
                <span className="text-right shrink-0">
                  <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">{r.servedBy}</span>
                  <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
                    {t('last run {date}', { date: new Date(r.at).toLocaleDateString(dateLocale()) })}
                  </span>
                </span>
              ) : (
                <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{t('not used yet')}</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        {t('What each model actually ran as, taken from your own recent AI calls — an alias can point somewhere different without warning.')}
      </p>
    </>
  );
}

export function SettingsPanel({ isOpen, settings, isSaving, onClose, onSave, isAdmin = false, userId, userEmail }: Props) {
  const t = useT();
  // Kept on this device by the i18n module, not in `settings`: it applies at
  // once and has nothing to do with the Save button.
  const [languagePreference, setLanguagePreference] = useLanguagePreference();
  const languageChoices: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t('System') },
    ...UI_LANGUAGES.map((l) => ({ value: l.code as LanguagePreference, label: l.label })),
  ];
  const tabs = TABS.map((tab) => ({ ...tab, label: t(tab.label), short: tab.short ? t(tab.short) : undefined }));
  const {
    connected, pendingIncoming, pendingOutgoing, busy: linksBusy,
    fetchLinks, invite, accept, disconnect, rename,
  } = useAccountLinks(userId, userEmail);
  const [local, setLocal] = useState<AppSettings>(settings);
  const [tab, setTab] = useState<Tab>('settings');
  const { usage, loadingUsage, fetchUsage } = useUsage(userId);
  const { resolutionFor } = useModelResolution(userId);

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
  const modelOf = (task: AiTask) => local.task_models?.[task] || local.gemini_model;
  const modelsInUse = [...new Set(AI_TASKS.map((task) => modelOf(task.task)))];

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogTrigger className="hidden" />
      <DialogContent className="sm:max-w-[640px] h-[82vh] flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6 text-sk-primary" /> {t('Settings')}
          </DialogTitle>
          <DialogDescription>{t('Preferences, Shortcuts, AI models and more.')}</DialogDescription>
        </DialogHeader>

        {/* Never scrolls with the content; a label never wraps (SegmentedTabs). */}
        <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} label={t('Settings sections')} idPrefix="settings" className="shrink-0" />

        {/* Scrollable content area — fills remaining height */}
        <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`} className="flex-1 overflow-y-auto min-h-0">
          {tab === 'settings' && (
            <div className="space-y-6 py-2">
                <div className="space-y-2">
                  <Label id="settings-language-label" className="font-semibold text-zinc-700 dark:text-zinc-300">{t('Language')}</Label>
                  <div role="group" aria-labelledby="settings-language-label" className="flex gap-2">
                    {languageChoices.map((choice) => (
                      <button
                        key={choice.value}
                        type="button"
                        aria-pressed={languagePreference === choice.value}
                        onClick={() => setLanguagePreference(choice.value)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                          languagePreference === choice.value
                            ? 'bg-sk-primary border-sk-primary text-white dark:text-primary-foreground'
                            : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-sk-primary/40'
                        }`}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('Follows your device unless you choose one. Stored on this device.')}</p>
                </div>

                <div className="space-y-2">
                  <Label id="settings-temperature-label" className="font-semibold text-zinc-700 dark:text-zinc-300">{t('Temperature Unit')}</Label>
                  <div role="group" aria-labelledby="settings-temperature-label" className="flex gap-2">
                    {(['C', 'F'] as const).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        aria-pressed={local.temperature_unit === unit}
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
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('All temperatures in recipes will be displayed in your preferred unit.')}</p>
                </div>

                <ShortcutSettings open={isOpen && tab === 'settings'} isAdmin={isAdmin} />
              </div>
            )}

            {tab === 'ai' && (
              <div className="space-y-6 py-2">
                {isAdmin ? (
                  <>
                    <p className="text-xs rounded-xl px-3 py-2 bg-sk-surface-high dark:bg-muted text-sk-on-surface-variant dark:text-muted-foreground">
                      {t('You are the admin: the AI models below apply to everyone using the app. Nobody else can change them.')}
                    </p>
                  <div className="space-y-2">
                    <Label className="font-semibold text-zinc-700 dark:text-zinc-300">{t('Main model')}</Label>
                    <Select value={local.gemini_model} onValueChange={(v) => { if (v) setLocal((p) => ({ ...p, gemini_model: v })); }}>
                      <SelectTrigger aria-label={t('Main model')} className="w-full h-auto min-h-9 py-1.5">
                        {/* An explicit label: without it the trigger renders the
                            selected item's entire block — description and price
                            included — inside a fixed-height, nowrap box. */}
                        <SelectValue placeholder={t('Select model')}>
                          {(value: string) => {
                            const m = MODEL_OPTIONS.find((o) => o.id === value);
                            if (!m) return t('Select model');
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
                                    {t(m.badge)}
                                  </span>
                                )}
                                <span className="text-[11px] font-normal text-zinc-600 dark:text-zinc-400">{m.id}</span>
                              </span>
                              <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400 whitespace-normal">{t(m.description)}</span>
                              <span className="text-[11px] font-normal text-zinc-600 dark:text-zinc-400">{t(m.price)}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {t('Used by every task that has no model of its own below.')}
                    </p>

                    <ModelResolutionList ids={MODEL_OPTIONS.map((m) => m.id)} resolutionFor={resolutionFor} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Label className="font-semibold text-zinc-700 dark:text-zinc-300">{t('Model per task')}</Label>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                          {t('Reading a photographed page is far harder than tagging a recipe you already have. Put the cheap tasks on Haiku and keep extraction on a stronger model. A Claude model that fails hands the task to Gemini automatically.')}
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => setLocal((p) => ({ ...p, task_models: { ...RECOMMENDED_TASK_MODELS } }))}
                        disabled={usingRecommended}
                        className="shrink-0 h-8 px-3 text-xs rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border-0 disabled:opacity-40"
                      >
                        {t('Use recommended')}
                      </Button>
                    </div>

                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
                      {AI_TASKS.map((task) => (
                        <div key={task.task} className="p-3 flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t(task.label)}</p>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400">{t(task.description)}</p>
                          </div>
                          <Select
                            value={local.task_models?.[task.task] ?? ''}
                            onValueChange={(v) => setTaskModel(task.task, v === '' ? null : (v as string))}
                          >
                            <SelectTrigger aria-label={t('Model for {task}', { task: t(task.label) })} className="w-[11rem] shrink-0">
                              <SelectValue placeholder={t('Same as main')}>
                                {(value: string) => (
                                  <span className="truncate">
                                    {value ? (MODEL_OPTIONS.find((o) => o.id === value)?.name ?? value) : t('Same as main')}
                                  </span>
                                )}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">
                                <span className="text-sm">{t('Same as main ({model})', { model: mainModelName })}</span>
                              </SelectItem>
                              {MODEL_OPTIONS.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  <span className="text-sm">
                                    {m.name}
                                    {m.id === task.recommended && (
                                      <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-sk-on-surface-variant dark:text-muted-foreground">
                                        {t('suggested')}
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
                        ? t('Every task uses the main model ({model}).', { model: mainModelName })
                        : t('{n} of {total} tasks have their own model.', { n: overrideCount, total: AI_TASKS.length })}
                    </p>
                  </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Label className="font-semibold text-zinc-700 dark:text-zinc-300">{t('AI models')}</Label>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {t("Chosen by the app's admin for everyone. This is the model each task runs on.")}
                    </p>
                    <div aria-label={t('AI model per task')} role="list" className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
                      {AI_TASKS.map((task) => {
                        const id = modelOf(task.task);
                        const option = MODEL_OPTIONS.find((m) => m.id === id);
                        return (
                          <div key={task.task} role="listitem" className="px-3 py-2.5 flex items-baseline justify-between gap-3">
                            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 min-w-0">{t(task.label)}</span>
                            <span className="text-right shrink-0">
                              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{option?.name ?? id}</span>
                              <span className="block font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{id}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <ModelResolutionList ids={modelsInUse} resolutionFor={resolutionFor} />
                  </div>
                )}
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
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{t("Today's AI usage")}</h3>
                    <button onClick={fetchUsage} disabled={loadingUsage} aria-label={t('Refresh')} className="text-zinc-400 hover:text-sk-primary transition-colors disabled:opacity-50">
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingUsage ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  {usage ? (
                    <>
                      <div className="flex items-end gap-1.5">
                        <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{usage.used}</span>
                        <span className="text-sm text-zinc-400 dark:text-zinc-500 mb-1">{t('/ {limit} calls', { limit: usage.limit })}</span>
                        <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full mb-1 ${
                          usage.remaining === 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                          : usage.remaining < 20 ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                        }`}>
                          {t('{n} remaining', { n: usage.remaining })}
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
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{t('Resets daily at midnight UTC.')}</p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-400">{loadingUsage ? t('Loading…') : t('No usage data yet.')}</p>
                  )}
                </div>

                <GeminiLogs />
              </div>
            )}
        </div>

        {/* Button area — always visible at bottom. Saves the temperature unit
            and, for the admin, the AI models; nothing else here is saved by it. */}
        {(tab === 'settings' || (tab === 'ai' && isAdmin)) && (
          <div className="shrink-0 bg-gradient-to-b from-transparent via-white via-50% to-white dark:via-zinc-900 dark:to-zinc-900 pt-4 pb-2 border-t border-zinc-100 dark:border-zinc-800 flex gap-3">
            <Button onClick={handleSave} disabled={!hasChanges || isSaving} className="flex-1 bg-sk-primary hover:bg-sk-primary-container disabled:bg-zinc-300 disabled:cursor-not-allowed text-white dark:text-primary-foreground font-semibold shadow-md py-3 text-base border-0 rounded-full">
              {isSaving ? t('Saving...') : t('Save Settings')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
