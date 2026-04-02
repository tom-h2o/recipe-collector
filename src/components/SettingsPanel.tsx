import { Settings, BarChart2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_PROMPT } from '@/lib/constants';
import { GeminiLogs } from '@/components/GeminiLogs';
import type { AppSettings } from '@/types';

type Tab = 'settings' | 'logs';

interface Props {
  isOpen: boolean;
  settings: AppSettings;
  isSaving: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
}

export function SettingsPanel({ isOpen, settings, isSaving, onClose, onSave }: Props) {
  const [local, setLocal] = useState<AppSettings>(settings);
  const [tab, setTab] = useState<Tab>('settings');

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLocal(settings); }, [settings, isOpen]);

  // Reset tab when closed
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!isOpen) setTab('settings'); }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogTrigger className="hidden" />
      <DialogContent className="sm:max-w-[640px] h-[82vh] flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6 text-orange-500" /> Settings
          </DialogTitle>
          <DialogDescription>Configure the Gemini AI model, prompt, and API keys.</DialogDescription>
        </DialogHeader>

        {/* Tab switcher — fixed position, never moves */}
        <div className="shrink-0 flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 gap-1">
          <button
            onClick={() => setTab('settings')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'settings' ? 'bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            <Settings className="w-4 h-4" /> General
          </button>
          <button
            onClick={() => setTab('logs')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'logs' ? 'bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            <BarChart2 className="w-4 h-4" /> Usage Logs
          </button>
        </div>

        {/* Scrollable content area — fills remaining height */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === 'settings' && (
            <div className="space-y-6 py-2">
              <div className="space-y-4 border-b border-zinc-100 dark:border-zinc-800 pb-6">
                <Label className="font-bold text-zinc-800 dark:text-zinc-200 text-lg">API Key Configuration</Label>
                <div className="space-y-2 mt-2">
                  <Label className="font-semibold text-zinc-700 dark:text-zinc-300">Active API Key Environment Variable</Label>
                  <Select
                    value={String(local.active_api_key)}
                    onValueChange={(v) => { if (v) setLocal((p) => ({ ...p, active_api_key: parseInt(v) as 1 | 2 })); }}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select active key" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Use GEMINI_API_KEY_1</SelectItem>
                      <SelectItem value="2">Use GEMINI_API_KEY_2</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Select which environment variable the server functions should use for Gemini processing.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold text-zinc-700 dark:text-zinc-300">Temperature Unit</Label>
                <div className="flex gap-2">
                  {(['C', 'F'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => setLocal((p) => ({ ...p, temperature_unit: unit }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                        local.temperature_unit === unit
                          ? 'bg-orange-500 border-orange-500 text-white'
                          : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-orange-300'
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
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select model" /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Gemini 3 — Preview</SelectLabel>
                      <SelectItem value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</SelectItem>
                      <SelectItem value="gemini-3-flash-preview">gemini-3-flash-preview</SelectItem>
                      <SelectItem value="gemini-3.1-flash-lite-preview">gemini-3.1-flash-lite-preview</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Gemini 2.5 — Stable</SelectLabel>
                      <SelectItem value="gemini-2.5-pro">gemini-2.5-pro</SelectItem>
                      <SelectItem value="gemini-2.5-flash">gemini-2.5-flash</SelectItem>
                      <SelectItem value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Lite is fastest and cheapest; Flash balances speed and quality; Pro is most accurate. Preview models are newer but may change.</p>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold text-zinc-700 dark:text-zinc-300">Extraction Prompt</Label>
                <Textarea
                  value={local.gemini_prompt}
                  onChange={(e) => setLocal((p) => ({ ...p, gemini_prompt: e.target.value }))}
                  className="min-h-[300px] font-mono text-xs"
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">This is the prompt sent to Gemini. The webpage content is appended automatically.</p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button onClick={() => onSave(local)} disabled={isSaving} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold">
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </Button>
                <Button onClick={() => setLocal((p) => ({ ...p, gemini_prompt: DEFAULT_PROMPT }))} variant="outline" className="flex-1 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-600">
                  Reset Prompt to Default
                </Button>
              </div>
            </div>
          )}

          {tab === 'logs' && (
            <div className="py-2">
              <GeminiLogs />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
