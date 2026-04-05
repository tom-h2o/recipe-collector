import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, KeyRound, Sun, Moon } from 'lucide-react';
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

/* Speisekammer skeleton key icon */
function SpeisekammerLogo({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" stroke="#315f3b" strokeWidth="2.5" fill="none"/>
      <circle cx="11" cy="11" r="3" fill="#315f3b"/>
      <line x1="16.5" y1="14.5" x2="30" y2="28" stroke="#315f3b" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="23" y1="21.5" x2="26" y2="24.5" stroke="#315f3b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="26" y1="24.5" x2="29" y2="21.5" stroke="#315f3b" strokeWidth="2" strokeLinecap="round"/>
      <path d="M7 4 Q11 1 15 5 Q11 8 7 4Z" fill="#bcefc0" opacity="0.8"/>
    </svg>
  );
}

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
      <div className="min-h-screen bg-sk-surface dark:bg-background flex items-center justify-center">
        <SpeisekammerLogo size={48} />
      </div>
    );
  }

  // Password recovery mode — user clicked the reset link in their email
  if (isPasswordRecovery) {
    return (
      <div className="min-h-screen bg-sk-surface dark:bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-3">
              <KeyRound className="w-9 h-9 text-sk-primary dark:text-primary" />
              <h1 className="font-serif text-3xl font-normal text-sk-on-surface dark:text-foreground">
                Set New Password
              </h1>
            </div>
            <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground">
              Choose a new password for your account.
            </p>
          </div>
          <form onSubmit={handleSetNewPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="font-sans font-semibold text-sk-on-surface-variant dark:text-muted-foreground text-xs uppercase tracking-widest">
                New password
              </Label>
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
                  className="pr-10 bg-sk-surface-highest dark:bg-input border-0 focus-visible:ring-sk-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sk-outline hover:text-sk-primary"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white font-semibold rounded-full border-0"
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
      <div className="min-h-screen bg-sk-surface dark:bg-background flex items-start justify-center p-6 pt-24">
        <button
          onClick={toggleDark}
          className="fixed top-4 right-4 p-2 rounded-full hover:bg-sk-surface-low dark:hover:bg-muted text-sk-outline dark:text-muted-foreground transition-colors"
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        <div className="w-full max-w-sm">
          {/* Speisekammer branding */}
          <div className="text-center space-y-2 mb-10">
            <div className="flex items-center justify-center gap-3 mb-1">
              <SpeisekammerLogo size={44} />
              <h1 className="font-serif text-3xl sm:text-4xl font-normal text-sk-primary dark:text-primary tracking-tight">
                Speisekammer
              </h1>
            </div>
            <p className="font-sans text-xs uppercase tracking-[0.15em] text-sk-on-surface-variant dark:text-muted-foreground">
              Your Curated Recipe Vault
            </p>
            <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground mt-2">
              Sign in to access your recipes
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex bg-sk-surface-low dark:bg-muted rounded-full p-1 gap-1 mb-8">
            <button
              onClick={() => { setMode('password'); setPasswordStep('signin'); setUnconfirmedEmail(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-semibold transition-all ${
                mode === 'password'
                  ? 'bg-white dark:bg-card shadow-ambient text-sk-primary dark:text-primary'
                  : 'text-sk-on-surface-variant hover:text-sk-primary dark:hover:text-primary'
              }`}
            >
              <Lock className="w-3.5 h-3.5" /> Password
            </button>
            <button
              onClick={() => { setMode('magic'); setMagicSent(false); setUnconfirmedEmail(null); setMagicError(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-semibold transition-all ${
                mode === 'magic'
                  ? 'bg-white dark:bg-card shadow-ambient text-sk-primary dark:text-primary'
                  : 'text-sk-on-surface-variant hover:text-sk-primary dark:hover:text-primary'
              }`}
            >
              <Mail className="w-3.5 h-3.5" /> Magic Link
            </button>
          </div>

          {/* Form area */}
          <div className="min-h-[320px]">

          {mode === 'password' && passwordStep === 'signin' && (
            <>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="font-sans font-semibold text-sk-on-surface-variant dark:text-muted-foreground text-xs uppercase tracking-widest">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setLoginError(null); }}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="bg-sk-surface-highest dark:bg-input border-0 focus-visible:ring-sk-primary/30 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="font-sans font-semibold text-sk-on-surface-variant dark:text-muted-foreground text-xs uppercase tracking-widest">
                    Password
                  </Label>
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
                      className={`pr-10 bg-sk-surface-highest dark:bg-input border-0 focus-visible:ring-sk-primary/30 rounded-xl ${loginError ? 'ring-2 ring-destructive/40' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-sk-outline hover:text-sk-primary"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {loginError && (
                  <div className="p-3 bg-destructive/8 border border-destructive/20 rounded-xl text-sm space-y-1.5">
                    <p className="text-destructive dark:text-destructive">{loginError}</p>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={() => { setPasswordStep('forgot'); setResetSent(false); setLoginError(null); }}
                        className="font-semibold text-destructive underline"
                      >
                        Reset password or set one for the first time →
                      </button>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white font-semibold rounded-full border-0"
                >
                  {isSubmitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
                </Button>
                {!isSignUp && !loginError && (
                  <button
                    type="button"
                    onClick={() => { setPasswordStep('forgot'); setResetSent(false); }}
                    className="w-full text-sm text-sk-outline hover:text-sk-primary dark:hover:text-primary transition-colors font-sans"
                  >
                    Forgot password?
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setIsSignUp((v) => !v); setUnconfirmedEmail(null); setLoginError(null); }}
                  className="w-full text-sm text-sk-on-surface-variant hover:text-sk-on-surface dark:hover:text-foreground transition-colors font-sans"
                >
                  {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>
              </form>

              {unconfirmedEmail && (
                <div className="p-4 bg-sk-secondary-container/30 border border-sk-secondary-container rounded-2xl text-sm space-y-2 mt-4">
                  <p className="font-semibold text-sk-secondary dark:text-secondary-foreground">Email not confirmed</p>
                  <p className="text-sk-on-surface-variant dark:text-muted-foreground">
                    Check your inbox (and spam folder) for a confirmation email sent to <strong>{unconfirmedEmail}</strong>.
                  </p>
                  <button
                    onClick={handleResendConfirmation}
                    disabled={isSubmitting}
                    className="text-sk-primary dark:text-primary underline font-semibold disabled:opacity-50"
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
                <p className="text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">
                  Enter your email and we'll send a link to set a new password. This also works if you've never set a password (e.g. you always used magic link).
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email" className="font-sans font-semibold text-sk-on-surface-variant dark:text-muted-foreground text-xs uppercase tracking-widest">
                    Email address
                  </Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="bg-sk-surface-highest dark:bg-input border-0 focus-visible:ring-sk-primary/30 rounded-xl"
                  />
                </div>
                {resetError && (
                  <div className="p-3 bg-destructive/8 border border-destructive/20 rounded-xl text-sm text-destructive">
                    {resetError}
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white font-semibold rounded-full border-0"
                >
                  {isSubmitting ? 'Sending…' : 'Send reset link'}
                </Button>
                <button
                  type="button"
                  onClick={() => { setPasswordStep('signin'); setResetError(null); }}
                  className="w-full text-sm text-sk-outline hover:text-sk-primary dark:hover:text-primary transition-colors font-sans"
                >
                  ← Back to sign in
                </button>
              </form>
            ) : (
              <div className="text-center p-6 bg-sk-primary-fixed/30 rounded-2xl border border-sk-primary-fixed">
                <p className="font-serif font-normal text-lg text-sk-primary dark:text-primary">Check your inbox!</p>
                <p className="text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground mt-1">
                  We sent a password reset link to <strong>{email}</strong>
                </p>
                <button
                  onClick={() => { setPasswordStep('signin'); setResetSent(false); }}
                  className="mt-3 text-xs text-sk-outline underline font-sans"
                >
                  Back to sign in
                </button>
              </div>
            )
          )}

          {mode === 'magic' && (
            !magicSent ? (
              <form onSubmit={handleMagicSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="magic-email" className="font-sans font-semibold text-sk-on-surface-variant dark:text-muted-foreground text-xs uppercase tracking-widest">
                    Email address
                  </Label>
                  <Input
                    id="magic-email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setMagicError(null); }}
                    placeholder="you@example.com"
                    required
                    className="bg-sk-surface-highest dark:bg-input border-0 focus-visible:ring-sk-primary/30 rounded-xl"
                  />
                </div>
                {magicError && (
                  <div className="p-3 bg-destructive/8 border border-destructive/20 rounded-xl text-sm text-destructive">
                    {magicError}
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white font-semibold rounded-full border-0"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {isSubmitting ? 'Sending…' : 'Send Magic Link'}
                </Button>
              </form>
            ) : (
              <div className="text-center p-6 bg-sk-primary-fixed/30 rounded-2xl border border-sk-primary-fixed">
                <p className="font-serif font-normal text-lg text-sk-primary dark:text-primary">Check your inbox!</p>
                <p className="text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground mt-1">
                  We sent a magic link to <strong>{email}</strong>
                </p>
                <button
                  onClick={() => setMagicSent(false)}
                  className="mt-3 text-xs text-sk-outline underline font-sans"
                >
                  Use a different email
                </button>
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
      <div className="min-h-screen bg-sk-surface dark:bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white dark:bg-card rounded-3xl shadow-ambient p-10 space-y-6 text-center">
          <SpeisekammerLogo size={56} />
          <div>
            <h2 className="font-serif text-2xl font-normal text-sk-on-surface dark:text-foreground">
              Welcome back!
            </h2>
            <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground mt-2">
              We found existing recipes that aren't assigned to any account yet. Claim them as yours to continue.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              onClick={claimExistingRecipes}
              disabled={isClaiming}
              className="w-full h-12 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white font-semibold rounded-full border-0"
            >
              {isClaiming ? 'Claiming...' : 'Claim all existing recipes'}
            </Button>
            <button
              onClick={() => { setClaimed(true); setHasUnclaimed(false); }}
              className="text-sm font-sans text-sk-outline hover:text-sk-on-surface-variant transition-colors"
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
