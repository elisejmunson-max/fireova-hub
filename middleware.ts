// Auth bypassed — pass all requests through directly.
// Re-enable the session check here once Supabase credentials are configured.
import { NextResponse } from 'next/server'

export function middleware() {
  return NextResponse.next()
}

export const config = {
  // Skip static assets and images — Next.js handles those directly.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
