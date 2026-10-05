import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Keep local/dev builds usable until Supabase is configured.
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value
      },
      set(name: string, value: string, options: any) {
        request.cookies.set({ name, value, ...options })
        response = NextResponse.next({ request })
        response.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: any) {
        request.cookies.set({ name, value: '', ...options })
        response = NextResponse.next({ request })
        response.cookies.set({ name, value: '', ...options, maxAge: 0 })
      },
    },
  })

  // getUser validates the current access token and refreshes it when needed.
  // Any replacement cookies are copied to both this request and the browser.
  await supabase.auth.getUser()

  return response
}

export const config = {
  // Skip static assets and images — Next.js handles those directly.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
