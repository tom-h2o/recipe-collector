import { Settings } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MODELS, DEFAULT_PROMPT } from '@/lib/constants';
import type { AppSettings } from '@/types';

interface Props {
  isOpen: boolean;
  settings: AppSettings;
  isSaving: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
}

export function SettingsPanel({ isOpen, settings, isSaving, onClose, onSave }: Props) {
  const [local, setLocal] = useState<AppSettings>(settings);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLocal(settings); }, [settings, isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogTrigger className="hidden" />
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6 text-orange-500" /> Settings
          </DialogTitle>
          <DialogDescription>Configure the Gemini AI model, prompt, and API keys.</DialogDescription>
        </DialogHeader>
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
              <p className="text-xs text-zinc-400">Select which environment variable the server functions should use for Gemini processing.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-semibold text-zinc-700 dark:text-zinc-300">Gemini Model</Label>
            <Select value={local.gemini_model} onValueChange={(v) => { if (v) setLocal((p) => ({ ...p, gemini_model: v })); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select model" /></SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-400">Flash is fastest; Pro is most accurate for complex pages.</p>
          </div>

          <div className="space-y-2">
            <Label className="font-semibold text-zinc-700 dark:text-zinc-300">Extraction Prompt</Label>
            <Textarea
              value={local.gemini_prompt}
              onChange={(e) => setLocal((p) => ({ ...p, gemini_prompt: e.target.value }))}
              className="min-h-[300px] font-mono text-xs"
            />
            <p className="text-xs text-zinc-400">This is the prompt sent to Gemini. The webpage content is appended automatically.</p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={() => onSave(local)} disabled={isSaving} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold">
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
            <Button onClick={() => setLocal((p) => ({ ...p, gemini_prompt: DEFAULT_PROMPT }))} variant="outline" className="flex-1">
              Reset Prompt to Default
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
