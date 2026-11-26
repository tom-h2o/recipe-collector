import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { openedFromRecoveryLink, supabase } from '@/lib/supabase';
import { clearPrivateCaches } from '@/lib/clearPrivateCaches';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // From the link itself, not only the event: see src/lib/recoveryLink.ts.
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(openedFromRecoveryLink);

  useEffect(() => {
    // onAuthStateChange is the single source of truth for initial state.
    // It always fires INITIAL_SESSION (or PASSWORD_RECOVERY) on mount before
    // any async getUser() call could resolve — eliminating the race condition
    // where loading was set false before PASSWORD_RECOVERY fired.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      } else if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Only these end recovery: the new password was set, or the person
        // left. SIGNED_IN, INITIAL_SESSION and TOKEN_REFRESHED all arrive
        // around a recovery link, in no fixed order, and INITIAL_SESSION
        // clearing it is what sent the link straight to the vault.
        setIsPasswordRecovery(false);
      }
      // Also when the session ends without the button (expired, or signed out
      // in another tab): the offline copy is the previous person's.
      if (event === 'SIGNED_OUT') void clearPrivateCaches();
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signInWithEmail(email: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) return { error: error.message };
    return { error: null };
  }

  async function signInWithPassword(email: string, password: string): Promise<{ error: string | null }> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (!data.session) return { error: 'Sign in failed — please try again or use a magic link.' };
    return { error: null };
  }

  async function signUpWithPassword(email: string, password: string): Promise<{ error: string | null; needsConfirmation?: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) return { error: error.message };
    // session is null when email confirmation is required
    const needsConfirmation = !data.session;
    return { error: null, needsConfirmation };
  }

  async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) return { error: error.message };
    return { error: null };
  }

  async function updatePassword(newPassword: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    setIsPasswordRecovery(false);
    return { error: null };
  }

  async function resendConfirmation(email: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) return { error: error.message };
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    await clearPrivateCaches();
  }

  return {
    user, loading, isPasswordRecovery,
    signInWithEmail, signInWithPassword, signUpWithPassword,
    sendPasswordReset, updatePassword, resendConfirmation, signOut,
  };
}
