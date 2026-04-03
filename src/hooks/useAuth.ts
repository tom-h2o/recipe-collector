import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    // onAuthStateChange is the single source of truth for initial state.
    // It always fires INITIAL_SESSION (or PASSWORD_RECOVERY) on mount before
    // any async getUser() call could resolve — eliminating the race condition
    // where loading was set false before PASSWORD_RECOVERY fired.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      } else if (event !== 'SIGNED_IN') {
        // Don't clear recovery mode on SIGNED_IN — Supabase fires SIGNED_IN
        // immediately after PASSWORD_RECOVERY as part of the same flow.
        // Only clear it on other events (SIGNED_OUT, USER_UPDATED, etc.)
        setIsPasswordRecovery(false);
      }
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

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
  }

  return {
    user, loading, isPasswordRecovery,
    signInWithGoogle, signInWithEmail, signInWithPassword, signUpWithPassword,
    sendPasswordReset, updatePassword, resendConfirmation, signOut,
  };
}
