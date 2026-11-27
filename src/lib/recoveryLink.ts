/**
 * A password-reset email links back to the app with the recovery session in
 * the hash (Supabase's implicit flow): `#access_token=…&type=recovery&…`.
 *
 * useAuth starts in recovery mode from this, instead of waiting for the
 * PASSWORD_RECOVERY event. That event is sent from a setTimeout inside the
 * client's initialisation, and INITIAL_SESSION from the subscriber's own async
 * path, so they arrive in no fixed order; INITIAL_SESSION used to clear
 * recovery mode, and the reset link then opened the vault instead of "Set New
 * Password" (found by tests/e2e/authFlows.spec.ts). An error redirect (expired
 * link) carries no access token and is not recovery.
 */
export function isRecoveryHash(hash: string): boolean {
  return linkType(hash) === 'recovery';
}

/**
 * An invitation (Supabase → Authentication → Users → Invite user) arrives the
 * same way with `type=invite`. It signs the person in to an account that has
 * no password yet, so they are asked to choose one, like after a reset;
 * otherwise their next sign-in would have to be a magic link or a reset.
 */
export function isInviteHash(hash: string): boolean {
  return linkType(hash) === 'invite';
}

function linkType(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get('access_token') ? params.get('type') : null;
}
