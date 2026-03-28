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
  const { user, loading, signInWithGoogle, signInWithEmail } = useAuth();
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
            <Button
              onClick={signInWithGoogle}
              className="w-full h-12 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-semibold rounded-xl shadow-sm transition-colors"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200 dark:border-zinc-800" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-zinc-50 dark:bg-zinc-950 px-2 text-zinc-400 font-medium">or</span>
              </div>
            </div>

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
