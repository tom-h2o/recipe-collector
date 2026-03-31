import { useState } from 'react';
import { ChefHat, Mail, Lock, Eye, EyeOff, KeyRound, Sun, Moon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useDarkMode } from '@/hooks/useDarkMode';

interface Props {
  children: React.ReactNode;
}

type AuthMode = 'password' | 'magic';
type PasswordStep = 'signin' | 'forgot' | 'reset';

export function AuthGate({ children }: Props) {
  const {
    user, loading, isPasswordRecovery,
    signInWithEmail, signInWithPassword, signUpWithPassword,
    sendPasswordReset, updatePassword, resendConfirmation,
  } = useAuth();
  const { isDark, toggle: toggleDark } = useDarkMode();
  const [mode, setMode] = useState<AuthMode>('password');
  const [passwordStep, setPasswordStep] = useState<PasswordStep>('signin');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [magicError, setMagicError] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
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
    setLoginError(null);
    setUnconfirmedEmail(null);
    try {
      if (isSignUp) {
        const { error, needsConfirmation } = await signUpWithPassword(email, password);
        if (error) { setLoginError(error); return; }
        if (needsConfirmation) {
          setUnconfirmedEmail(email);
          setIsSignUp(false);
        }
        // if needsConfirmation is false, onAuthStateChange already signed the user in
      } else {
        const { error } = await signInWithPassword(email, password);
        if (error) {
          if (error.toLowerCase().includes('not confirmed')) {
            setUnconfirmedEmail(email);
          } else {
            setLoginError(error);
          }
        }
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendConfirmation() {
    if (!unconfirmedEmail) return;
    setIsSubmitting(true);
    try {
      const { error } = await resendConfirmation(unconfirmedEmail);
      if (error) { toast.error(error); return; }
      toast.success('Confirmation email resent! Check your inbox.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setIsSubmitting(true);
    setResetError(null);
    try {
      const { error } = await sendPasswordReset(email);
      if (error) { setResetError(error); return; }
      setResetSent(true);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword) return;
    setIsSubmitting(true);
    try {
      const { error } = await updatePassword(newPassword);
      if (error) { toast.error(error); return; }
      toast.success('Password updated! You are now signed in.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMagicSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setIsSubmitting(true);
    setMagicError(null);
    try {
      const { error } = await signInWithEmail(email);
      if (error) { setMagicError(error); return; }
      setMagicSent(true);
    } catch (err) {
      setMagicError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
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

  // Password recovery mode — user clicked the reset link in their email
  if (isPasswordRecovery) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-3">
              <KeyRound className="w-10 h-10 text-orange-500" />
              <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">Set New Password</h1>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400">Choose a new password for your account.</p>
          </div>
          <form onSubmit={handleSetNewPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="font-semibold text-zinc-700 dark:text-zinc-300">New password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  autoComplete="new-password"
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
              {isSubmitting ? 'Saving…' : 'Set new password'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-start justify-center p-6 pt-24">
        <button
          onClick={toggleDark}
          className="fixed top-4 right-4 p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors"
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        <div className="w-full max-w-sm">
          <div className="text-center space-y-3 mb-8">
            <div className="flex items-center justify-center gap-3">
              <ChefHat className="w-12 h-12 text-orange-500" />
              <h1 className="text-4xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">Recipe Vault</h1>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400">Sign in to access your recipes</p>
          </div>

          {/* Mode toggle */}
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 gap-1 mb-8">
            <button
              onClick={() => { setMode('password'); setPasswordStep('signin'); setUnconfirmedEmail(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'password' ? 'bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              <Lock className="w-3.5 h-3.5" /> Password
            </button>
            <button
              onClick={() => { setMode('magic'); setMagicSent(false); setUnconfirmedEmail(null); setMagicError(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'magic' ? 'bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              <Mail className="w-3.5 h-3.5" /> Magic Link
            </button>
          </div>

          {/* Form area — fixed min-height so tabs/headline above never move */}
          <div className="min-h-[320px]">

          {mode === 'password' && passwordStep === 'signin' && (
            <>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="font-semibold text-zinc-700 dark:text-zinc-300">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setLoginError(null); }}
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
                      onChange={(e) => { setPassword(e.target.value); setLoginError(null); }}
                      placeholder={isSignUp ? 'Min. 8 characters' : '••••••••'}
                      required
                      minLength={isSignUp ? 8 : undefined}
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                      className={`pr-10 ${loginError ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
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

                {/* Inline error with reset suggestion */}
                {loginError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-sm space-y-1.5">
                    <p className="text-red-700 dark:text-red-400">{loginError}</p>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={() => { setPasswordStep('forgot'); setResetSent(false); setLoginError(null); }}
                        className="font-semibold text-red-700 dark:text-red-400 underline"
                      >
                        Reset password or set one for the first time →
                      </button>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl"
                >
                  {isSubmitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
                </Button>
                {!isSignUp && !loginError && (
                  <button
                    type="button"
                    onClick={() => { setPasswordStep('forgot'); setResetSent(false); }}
                    className="w-full text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setIsSignUp((v) => !v); setUnconfirmedEmail(null); setLoginError(null); }}
                  className="w-full text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                >
                  {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>
              </form>

              {/* Unconfirmed email banner */}
              {unconfirmedEmail && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl text-sm space-y-2">
                  <p className="font-semibold text-amber-800 dark:text-amber-300">Email not confirmed</p>
                  <p className="text-amber-700 dark:text-amber-400">Check your inbox (and spam folder) for a confirmation email sent to <strong>{unconfirmedEmail}</strong>.</p>
                  <button
                    onClick={handleResendConfirmation}
                    disabled={isSubmitting}
                    className="text-amber-700 dark:text-amber-400 underline font-semibold disabled:opacity-50"
                  >
                    {isSubmitting ? 'Sending…' : 'Resend confirmation email'}
                  </button>
                </div>
              )}
            </>
          )}

          {mode === 'password' && passwordStep === 'forgot' && (
            !resetSent ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Enter your email and we'll send a link to set a new password. This also works if you've never set a password (e.g. you always used magic link).
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email" className="font-semibold text-zinc-700 dark:text-zinc-300">Email address</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>
                {resetError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-sm text-red-700 dark:text-red-400">
                    {resetError}
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl"
                >
                  {isSubmitting ? 'Sending…' : 'Send reset link'}
                </Button>
                <button
                  type="button"
                  onClick={() => { setPasswordStep('signin'); setResetError(null); }}
                  className="w-full text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  ← Back to sign in
                </button>
              </form>
            ) : (
              <div className="text-center p-6 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-200 dark:border-green-800/50">
                <p className="font-bold text-green-700 dark:text-green-400">Check your inbox!</p>
                <p className="text-sm text-green-600 dark:text-green-500 mt-1">We sent a password reset link to <strong>{email}</strong></p>
                <button onClick={() => { setPasswordStep('signin'); setResetSent(false); }} className="mt-3 text-xs text-zinc-400 underline">Back to sign in</button>
              </div>
            )
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
                    onChange={(e) => { setEmail(e.target.value); setMagicError(null); }}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                {magicError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-sm text-red-700 dark:text-red-400">
                    {magicError}
                  </div>
                )}
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

          </div>{/* end form area */}
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
