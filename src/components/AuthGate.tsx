import { useState } from 'react';
import { ChefHat, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  children: React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const { user, loading, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [magicSent, setMagicSent] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  // Check if there are unclaimed recipes (user_id IS NULL)
  // We show the "claim" prompt once after first login
  const [hasUnclaimed, setHasUnclaimed] = useState(false);

  async function checkUnclaimed() {
    const { count } = await supabase
      .from('recipes')
      .select('id', { count: 'exact', head: true })
      .is('user_id', null);
    setHasUnclaimed((count ?? 0) > 0);
  }

  async function claimExistingRecipes() {
    if (!user) return;
    setIsClaiming(true);
    const tables = ['recipes', 'meal_plan', 'shopping_list'] as const;
    try {
      await Promise.all(
        tables.map((t) =>
          supabase.from(t).update({ user_id: user.id }).is('user_id', null),
        ),
      );
      setClaimed(true);
      setHasUnclaimed(false);
      toast.success('All existing recipes claimed!');
    } catch {
      toast.error('Failed to claim recipes. Try again.');
    } finally {
      setIsClaiming(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <ChefHat className="w-10 h-10 text-orange-500 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-3">
              <ChefHat className="w-12 h-12 text-orange-500" />
              <h1 className="text-4xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">Recipe Vault</h1>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400">Sign in to access your recipes</p>
          </div>

          <div className="space-y-4">
            {!magicSent ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!email) return;
                  await signInWithEmail(email);
                  setMagicSent(true);
                  toast.success('Magic link sent! Check your email.');
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="font-semibold text-zinc-700 dark:text-zinc-300">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <Button type="submit" className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl">
                  <Mail className="w-4 h-4 mr-2" /> Send Magic Link
                </Button>
              </form>
            ) : (
              <div className="text-center p-6 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-200 dark:border-green-800/50">
                <p className="font-bold text-green-700 dark:text-green-400">Check your inbox!</p>
                <p className="text-sm text-green-600 dark:text-green-500 mt-1">We sent a magic link to <strong>{email}</strong></p>
                <button onClick={() => setMagicSent(false)} className="mt-3 text-xs text-zinc-400 underline">Use a different email</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Logged in — show claim prompt once if unclaimed data exists
  if (!claimed && hasUnclaimed === false && !isClaiming) {
    // Trigger check on first render after login
    checkUnclaimed();
  }

  if (!claimed && hasUnclaimed) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-10 space-y-6 text-center">
          <ChefHat className="w-16 h-16 text-orange-500 mx-auto" />
          <div>
            <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">Welcome back!</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mt-2">
              We found existing recipes that aren't assigned to any account yet. Claim them as yours to continue.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              onClick={claimExistingRecipes}
              disabled={isClaiming}
              className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl"
            >
              {isClaiming ? 'Claiming...' : 'Claim all existing recipes'}
            </Button>
            <button
              onClick={() => { setClaimed(true); setHasUnclaimed(false); }}
              className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              Skip (existing recipes will remain visible but unassigned)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
