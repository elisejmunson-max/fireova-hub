import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types'

export const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Use the same cookie-backed session as Server Components and middleware.
export function createClient() {
  if (!supabaseConfigured) {
    throw new Error('SUPABASE_NOT_CONFIGURED')
  }
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
