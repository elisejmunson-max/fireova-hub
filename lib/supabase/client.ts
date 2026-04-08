import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'

export const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Use @supabase/supabase-js directly for browser clients.
// @supabase/ssr (which pulls in ramda) is intentionally kept server-side only
// to avoid bundling hundreds of ramda modules into the client JS.
export function createClient() {
  if (!supabaseConfigured) {
    throw new Error('SUPABASE_NOT_CONFIGURED')
  }
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
