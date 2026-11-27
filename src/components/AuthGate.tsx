import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, KeyRound, Sun, Moon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useDarkMode } from '@/hooks/useDarkMode';
import { SpeisekammerLogo } from '@/components/SpeisekammerLogo';
import { isSignupOpen } from '@/lib/signupOpen';
import { DATA_NOTE_SHORT } from '@/lib/appInfo';
import { msg, translateMessage, useT } from '@/i18n';
import { rich } from '@/i18n/rich';

interface Props {
  children: React.ReactNode;
}

type AuthMode = 'password' | 'magic';
type PasswordStep = 'signin' | 'forgot' | 'reset';

export function AuthGate({ children }: Props) {
  const {
    user, loading, isPasswordRecovery, isInvite,
    signInWithEmail, signInWithPassword, signUpWithPassword,
    sendPasswordReset, updatePassword, resendConfirmation,
  } = useAuth();
  const { isDark, toggle: toggleDark } = useDarkMode();
  const t = useT();
  const signupOpen = isSignupOpen();
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
  // Errors are shown in the form they belong to, never only as a toast, which
  // disappears while the person is still reading it (see CLAUDE.md).
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
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
      setLoginError(err instanceof Error ? err.message : msg('Something went wrong. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendConfirmation() {
    if (!unconfirmedEmail) return;
    setIsSubmitting(true);
    setResendError(null);
    try {
      const { error } = await resendConfirmation(unconfirmedEmail);
      if (error) { setResendError(error); return; }
      toast.success(t('Confirmation email resent! Check your inbox.'));
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
      setResetError(err instanceof Error ? err.message : msg('Something went wrong. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword) return;
    setIsSubmitting(true);
    setRecoveryError(null);
    try {
      const { error } = await updatePassword(newPassword);
      if (error) { setRecoveryError(error); return; }
      toast.success(isInvite ? t('Password set. Welcome to Speisekammer!') : t('Password updated! You are now signed in.'));
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : msg('Something went wrong. Please try again.'));
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
      setMagicError(err instanceof Error ? err.message : msg('Something went wrong. Please try again.'));
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

  // Password recovery mode: the person opened the reset link from the email.
  // Only with a session; an expired link signs nobody in, and the sign-in
  // screen is the right place then.
  if (isPasswordRecovery && user) {
    return (
      <div className="min-h-screen bg-sk-surface dark:bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-3">
              <KeyRound className="w-9 h-9 text-sk-primary dark:text-primary" />
              <h1 className="font-serif text-3xl font-normal text-sk-on-surface dark:text-foreground">
                {isInvite ? t('Welcome to Speisekammer') : t('Set New Password')}
              </h1>
            </div>
            <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground">
              {isInvite
                ? t('Your invitation worked. Choose a password, so you can sign in again later.')
                : t('Choose a new password for your account.')}
            </p>
          </div>
          <form onSubmit={handleSetNewPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="font-sans font-semibold text-sk-on-surface-variant dark:text-muted-foreground text-xs uppercase tracking-widest">
                {t('New password')}
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setRecoveryError(null); }}
                  placeholder={t('Min. 8 characters')}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="pr-10 bg-sk-surface-highest dark:bg-input border-0 focus-visible:ring-sk-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('Hide password') : t('Show password')}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sk-outline hover:text-sk-primary"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {recoveryError && (
              <div role="alert" className="p-3 bg-destructive/8 border border-destructive/20 rounded-xl text-sm text-destructive">
                {translateMessage(recoveryError)}
              </div>
            )}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground font-semibold rounded-full border-0"
            >
              {isSubmitting ? t('Saving…') : isInvite ? t('Set password') : t('Set new password')}
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
          className="fixed top-[calc(var(--safe-top)+1rem)] right-[calc(var(--safe-right)+1rem)] p-2 rounded-full hover:bg-sk-surface-low dark:hover:bg-muted text-sk-outline dark:text-muted-foreground transition-colors"
          aria-label={t('Toggle dark mode')}
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
              {t('Your Curated Recipe Vault')}
            </p>
            <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground mt-2">
              {t('Sign in to access your recipes')}
            </p>
            <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground">
              {rich(t, 'New here? <a>See what Speisekammer does</a>', {
                a: (text) => (
                  <a href="/about" className="font-semibold text-sk-primary dark:text-primary hover:underline">
                    {text}
                  </a>
                ),
              })}
            </p>
            {!signupOpen && (
              <p className="font-sans text-xs text-sk-on-surface-variant dark:text-muted-foreground">
                {t('Accounts are by invitation for now.')}
              </p>
            )}
          </div>

          {/* Mode toggle */}
          <div className="flex bg-sk-surface-low rounded-full p-1 gap-1 mb-8">
            <button
              onClick={() => { setMode('password'); setPasswordStep('signin'); setUnconfirmedEmail(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-semibold transition-all ${
                mode === 'password'
                  ? 'bg-white dark:bg-sk-surface-highest shadow-ambient text-sk-primary dark:text-primary'
                  : 'text-sk-on-surface-variant hover:text-sk-primary dark:hover:text-primary'
              }`}
            >
              <Lock className="w-3.5 h-3.5" /> {t('Password')}
            </button>
            <button
              onClick={() => { setMode('magic'); setMagicSent(false); setUnconfirmedEmail(null); setMagicError(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-semibold transition-all ${
                mode === 'magic'
                  ? 'bg-white dark:bg-sk-surface-highest shadow-ambient text-sk-primary dark:text-primary'
                  : 'text-sk-on-surface-variant hover:text-sk-primary dark:hover:text-primary'
              }`}
            >
              <Mail className="w-3.5 h-3.5" /> {t('Magic Link')}
            </button>
          </div>

          {/* Form area */}
          <div className="min-h-[320px]">

          {mode === 'password' && passwordStep === 'signin' && (
            <>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="font-sans font-semibold text-sk-on-surface-variant dark:text-muted-foreground text-xs uppercase tracking-widest">
                    {t('Email address')}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setLoginError(null); }}
                    placeholder={t('you@example.com')}
                    required
                    autoComplete="email"
                    className="bg-sk-surface-highest dark:bg-input border-0 focus-visible:ring-sk-primary/30 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="font-sans font-semibold text-sk-on-surface-variant dark:text-muted-foreground text-xs uppercase tracking-widest">
                    {t('Password')}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setLoginError(null); }}
                      placeholder={isSignUp ? t('Min. 8 characters') : '••••••••'}
                      required
                      minLength={isSignUp ? 8 : undefined}
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                      className={`pr-10 bg-sk-surface-highest dark:bg-input border-0 focus-visible:ring-sk-primary/30 rounded-xl ${loginError ? 'ring-2 ring-destructive/40' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? t('Hide password') : t('Show password')}
                      aria-pressed={showPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-sk-outline hover:text-sk-primary"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {loginError && (
                  <div role="alert" className="p-3 bg-destructive/8 border border-destructive/20 rounded-xl text-sm space-y-1.5">
                    <p className="text-destructive dark:text-destructive">{translateMessage(loginError)}</p>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={() => { setPasswordStep('forgot'); setResetSent(false); setLoginError(null); }}
                        className="font-semibold text-destructive underline"
                      >
                        {t('Reset password or set one for the first time →')}
                      </button>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground font-semibold rounded-full border-0"
                >
                  {isSubmitting ? t('Please wait…') : isSignUp ? t('Create account') : t('Sign in')}
                </Button>
                {!isSignUp && !loginError && (
                  <button
                    type="button"
                    onClick={() => { setPasswordStep('forgot'); setResetSent(false); }}
                    className="w-full text-sm text-sk-outline hover:text-sk-primary dark:hover:text-primary transition-colors font-sans"
                  >
                    {t('Forgot password?')}
                  </button>
                )}
                {signupOpen && (
                  <button
                    type="button"
                    onClick={() => { setIsSignUp((v) => !v); setUnconfirmedEmail(null); setLoginError(null); }}
                    className="w-full text-sm text-sk-on-surface-variant hover:text-sk-on-surface dark:hover:text-foreground transition-colors font-sans"
                  >
                    {isSignUp ? t('Already have an account? Sign in') : t("Don't have an account? Sign up")}
                  </button>
                )}
              </form>

              {unconfirmedEmail && (
                <div className="p-4 bg-sk-primary-fixed/30 border border-sk-primary-fixed rounded-2xl text-sm space-y-2 mt-4">
                  <p className="font-semibold text-sk-primary dark:text-primary">{t('Check your inbox')}</p>
                  <p className="text-sk-on-surface-variant dark:text-muted-foreground">
                    {rich(t, 'We sent a confirmation link to <b>{email}</b>. Click it to activate your account, then sign in here.', { b: (text) => <strong>{text}</strong> }, { email: unconfirmedEmail })}
                  </p>
                  <button
                    onClick={handleResendConfirmation}
                    disabled={isSubmitting}
                    className="text-sk-primary dark:text-primary underline font-semibold disabled:opacity-50 text-xs"
                  >
                    {isSubmitting ? t('Sending…') : t('Resend confirmation email')}
                  </button>
                  {resendError && <p role="alert" className="text-destructive text-xs">{translateMessage(resendError)}</p>}
                </div>
              )}
            </>
          )}

          {mode === 'password' && passwordStep === 'forgot' && (
            !resetSent ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">
                  {t("Enter your email and we'll send a link to set a new password. This also works if you've never set a password (e.g. you always used magic link).")}
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email" className="font-sans font-semibold text-sk-on-surface-variant dark:text-muted-foreground text-xs uppercase tracking-widest">
                    {t('Email address')}
                  </Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('you@example.com')}
                    required
                    autoComplete="email"
                    className="bg-sk-surface-highest dark:bg-input border-0 focus-visible:ring-sk-primary/30 rounded-xl"
                  />
                </div>
                {resetError && (
                  <div role="alert" className="p-3 bg-destructive/8 border border-destructive/20 rounded-xl text-sm text-destructive">
                    {translateMessage(resetError)}
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground font-semibold rounded-full border-0"
                >
                  {isSubmitting ? t('Sending…') : t('Send reset link')}
                </Button>
                <button
                  type="button"
                  onClick={() => { setPasswordStep('signin'); setResetError(null); }}
                  className="w-full text-sm text-sk-outline hover:text-sk-primary dark:hover:text-primary transition-colors font-sans"
                >
                  {t('← Back to sign in')}
                </button>
              </form>
            ) : (
              <div className="text-center p-6 bg-sk-primary-fixed/30 rounded-2xl border border-sk-primary-fixed">
                <p className="font-serif font-normal text-lg text-sk-primary dark:text-primary">{t('Check your inbox!')}</p>
                <p className="text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground mt-1">
                  {rich(t, 'We sent a password reset link to <b>{email}</b>', { b: (text) => <strong>{text}</strong> }, { email })}
                </p>
                <button
                  onClick={() => { setPasswordStep('signin'); setResetSent(false); }}
                  className="mt-3 text-xs text-sk-outline underline font-sans"
                >
                  {t('Back to sign in')}
                </button>
              </div>
            )
          )}

          {mode === 'magic' && (
            !magicSent ? (
              <form onSubmit={handleMagicSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="magic-email" className="font-sans font-semibold text-sk-on-surface-variant dark:text-muted-foreground text-xs uppercase tracking-widest">
                    {t('Email address')}
                  </Label>
                  <Input
                    id="magic-email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setMagicError(null); }}
                    placeholder={t('you@example.com')}
                    required
                    className="bg-sk-surface-highest dark:bg-input border-0 focus-visible:ring-sk-primary/30 rounded-xl"
                  />
                </div>
                {magicError && (
                  <div role="alert" className="p-3 bg-destructive/8 border border-destructive/20 rounded-xl text-sm text-destructive">
                    {translateMessage(magicError)}
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground font-semibold rounded-full border-0"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {isSubmitting ? t('Sending…') : t('Send Magic Link')}
                </Button>
              </form>
            ) : (
              <div className="text-center p-6 bg-sk-primary-fixed/30 rounded-2xl border border-sk-primary-fixed">
                <p className="font-serif font-normal text-lg text-sk-primary dark:text-primary">{t('Check your inbox!')}</p>
                <p className="text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground mt-1">
                  {rich(t, 'We sent a magic link to <b>{email}</b>', { b: (text) => <strong>{text}</strong> }, { email })}
                </p>
                <button
                  onClick={() => setMagicSent(false)}
                  className="mt-3 text-xs text-sk-outline underline font-sans"
                >
                  {t('Use a different email')}
                </button>
              </div>
            )
          )}

          </div>{/* end form area */}

          <p className="mt-6 text-center text-xs font-sans leading-relaxed text-sk-on-surface-variant dark:text-muted-foreground">
            {t(DATA_NOTE_SHORT)}{' '}
            <a href="/about#your-data" className="font-semibold text-sk-primary dark:text-primary hover:underline">
              {t('What happens to your data')}
            </a>
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
