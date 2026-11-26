import { createClient } from '@supabase/supabase-js'
import { isRecoveryHash } from './recoveryLink'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables. Please check your .env.local file.')
}

/**
 * Whether this page was opened from a password-reset email. Read before
 * createClient, which consumes the hash. See recoveryLink.ts.
 */
export const openedFromRecoveryLink = typeof window !== 'undefined' && isRecoveryHash(window.location.hash)

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)
