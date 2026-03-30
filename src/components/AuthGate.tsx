import { useState } from 'react';
import { ChefHat, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  children: React.ReactNode;
}

type AuthMode = 'password' | 'magic';

export function AuthGate({ children }: Props) {
  const { user, loading, signInWithEmail, signInWithPassword, signUpWithPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>('password');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
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

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setIsSubmitting(true);
    try {
      if (isSignUp) {
        const { error } = await signUpWithPassword(email, password);
        if (error) { toast.error(error); return; }
        toast.success('Account created! Check your email to confirm, then sign in.');
        setIsSignUp(false);
      } else {
        const { error } = await signInWithPassword(email, password);
        if (error) {
          // Offer magic link fallback on wrong password
          toast.error(error);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMagicSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setIsSubmitting(true);
    try {
      await signInWithEmail(email);
      setMagicSent(true);
      toast.success('Magic link sent! Check your email.');
    } finally {
      setIsSubmitting(false);
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

          {/* Mode toggle */}
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 gap-1">
            <button
              onClick={() => setMode('password')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'password' ? 'bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              <Lock className="w-3.5 h-3.5" /> Password
            </button>
            <button
              onClick={() => { setMode('magic'); setMagicSent(false); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'magic' ? 'bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              <Mail className="w-3.5 h-3.5" /> Magic Link
            </button>
          </div>

          {mode === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="font-semibold text-zinc-700 dark:text-zinc-300">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="font-semibold text-zinc-700 dark:text-zinc-300">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignUp ? 'Min. 8 characters' : '••••••••'}
                    required
                    minLength={isSignUp ? 8 : undefined}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl"
              >
                {isSubmitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
              </Button>
              <button
                type="button"
                onClick={() => setIsSignUp((v) => !v)}
                className="w-full text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </form>
          )}

          {mode === 'magic' && (
            !magicSent ? (
              <form onSubmit={handleMagicSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="magic-email" className="font-semibold text-zinc-700 dark:text-zinc-300">Email address</Label>
                  <Input
                    id="magic-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {isSubmitting ? 'Sending…' : 'Send Magic Link'}
                </Button>
              </form>
            ) : (
              <div className="text-center p-6 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-200 dark:border-green-800/50">
                <p className="font-bold text-green-700 dark:text-green-400">Check your inbox!</p>
                <p className="text-sm text-green-600 dark:text-green-500 mt-1">We sent a magic link to <strong>{email}</strong></p>
                <button onClick={() => setMagicSent(false)} className="mt-3 text-xs text-zinc-400 underline">Use a different email</button>
              </div>
            )
          )}
        </div>
      </div>
    );
  }

  // Logged in — show claim prompt once if unclaimed data exists
  if (!claimed && hasUnclaimed === false && !isClaiming) {
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
