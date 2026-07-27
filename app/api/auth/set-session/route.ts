import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Called from the login page after the magic-link hash fragment is parsed.
// The client sends us the access_token + refresh_token; we call setSession
// so that @supabase/ssr writes the auth cookies — then the server-side
// getUser() check in layout.tsx will see a valid session.
//
// IMPORTANT: cookies must be set directly on the NextResponse object, not via
// cookies() from next/headers — the latter can silently drop writes in Route Handlers.
export async function POST(request: NextRequest) {
  const { access_token, refresh_token } = await request.json()

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'Missing tokens' }, { status: 400 })
  }

  // Build the response first so we can attach Set-Cookie headers to it
  const response = NextResponse.json({ ok: true })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          response.cookies.set(name, value, options)
        },
        remove(name: string, options: any) {
          response.cookies.set(name, '', { ...options, maxAge: 0 })
        },
      },
    }
  )

  const { error } = await supabase.auth.setSession({ access_token, refresh_token })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return response
}
