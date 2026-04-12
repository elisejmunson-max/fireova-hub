import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/types'

// ---------------------------------------------------------------------------
// Dev mock — returned when Supabase credentials are not yet configured.
// All query chains resolve to empty data so every page renders its empty state.
// ---------------------------------------------------------------------------
function makeMockQueryBuilder(): any {
  const builder: any = new Proxy(
    {},
    {
      get(_, prop) {
        // Make the builder awaitable — resolve with empty result
        if (prop === 'then') {
          return (resolve: (v: any) => void) =>
            resolve({ data: null, error: null, count: null })
        }
        // Every chained method (select, order, limit, eq, …) returns itself
        return () => builder
      },
    }
  )
  return builder
}

const devUser = { id: 'dev', email: 'catering@fireovapizza.com' }

const mockClient = {
  auth: {
    getUser: async () => ({ data: { user: devUser }, error: null }),
    signOut: async () => ({ error: null }),
  },
  from: () => makeMockQueryBuilder(),
  storage: { from: () => makeMockQueryBuilder() },
} as any

// ---------------------------------------------------------------------------

export function createClient() {
  // Fall back to mock when credentials are missing
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return mockClient
  }

  const cookieStore = cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set(name, value, options)
          } catch {
            // Called from a Server Component — session refresh handled by middleware
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set(name, '', { ...options, maxAge: 0 })
          } catch {
            // Called from a Server Component
          }
        },
      },
    }
  )
}
