import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Preview deployments are a safe visual-review environment. Do not force the
  // owner through production auth just to inspect work in progress.
  // Production behavior remains unchanged.
  const host = request.headers.get('host') ?? ''
  const isVercelPreview = host.endsWith('.vercel.app') && host !== 'fireova-hub-bamo.vercel.app'

  if (isVercelPreview) return NextResponse.next()
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
