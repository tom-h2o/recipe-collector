import { ChefHat, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';
import type { Recipe } from '@/types';

interface Props {
  recipe: Recipe | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CookMode({ recipe, isOpen, onClose }: Props) {
  const [cookStep, setCookStep] = useState(0);

  if (!recipe) return null;

  const steps = recipe.instructions.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const currentStep = steps[cookStep] || '';
  const isFirst = cookStep === 0;
  const isLast = cookStep === steps.length - 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { onClose(); setCookStep(0); } }}>
      <DialogTrigger className="hidden" />
      <DialogContent className="max-w-none w-screen h-screen max-h-screen rounded-none border-0 bg-zinc-950 text-white flex flex-col p-0">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <ChefHat className="w-6 h-6 text-orange-400" />
              <span className="font-bold text-lg text-white truncate max-w-[240px]">{recipe.title}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-white/50">Step {cookStep + 1} of {steps.length}</span>
              <button onClick={() => { onClose(); setCookStep(0); }} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center px-8 sm:px-24">
            <div className="max-w-2xl text-center space-y-8">
              <div className="w-16 h-16 rounded-full bg-orange-500 text-white flex items-center justify-center text-3xl font-black mx-auto shadow-lg shadow-orange-500/30">
                {cookStep + 1}
              </div>
              <p className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-relaxed text-white">
                {currentStep.replace(/^step\s*\d+[.:)]\s*/i, '')}
              </p>
            </div>
          </div>

          <div className="flex justify-center gap-1.5 py-4">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCookStep(i)}
                className={`rounded-full transition-all ${i === cookStep ? 'w-6 h-2.5 bg-orange-500' : 'w-2.5 h-2.5 bg-white/20 hover:bg-white/40'}`}
              />
            ))}
          </div>

          <div className="flex gap-4 px-6 pb-8">
            <Button
              onClick={() => setCookStep((s) => Math.max(0, s - 1))}
              disabled={isFirst}
              variant="outline"
              className="flex-1 h-14 text-lg font-bold rounded-2xl border-white/20 text-white hover:bg-white/10 bg-transparent"
            >
              ← Previous
            </Button>
            {isLast ? (
              <Button onClick={() => { onClose(); setCookStep(0); }} className="flex-1 h-14 text-lg font-bold rounded-2xl bg-orange-500 hover:bg-orange-600">
                ✓ Done!
              </Button>
            ) : (
              <Button onClick={() => setCookStep((s) => Math.min(steps.length - 1, s + 1))} className="flex-1 h-14 text-lg font-bold rounded-2xl bg-orange-500 hover:bg-orange-600">
                Next →
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
