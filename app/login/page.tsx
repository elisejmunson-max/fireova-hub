'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Auth flow:
// 1. We call the Supabase OTP REST API directly (no SDK) to send the magic link.
// 2. When the magic link lands here with #access_token in the URL hash, we:
//    a. POST tokens to /api/auth/set-session → server writes auth cookies
//       (the server-side layout's getUser() reads cookies, not localStorage)
//    b. Call browserSupabase.auth.setSession() → stores tokens in localStorage
//       (the browser Supabase client used for uploads/queries reads localStorage)

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle magic link redirect — supports both implicit flow (hash) and PKCE flow (code param)
  useEffect(() => {
    async function handleAuthCallback() {
      const hash = window.location.hash
      const searchParams = new URLSearchParams(window.location.search)
      const code = searchParams.get('code')

      // PKCE flow — exchange code for session using the SDK
      if (code) {
        const browserSupabase = createClient()
        const { data, error } = await browserSupabase.auth.exchangeCodeForSession(code)
        if (!error && data.session) {
          await fetch('/api/auth/set-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            }),
          })
          window.location.replace('/dashboard')
        }
        return
      }

      // Implicit flow — tokens in hash fragment
      if (!hash.includes('access_token')) return
      const params = new URLSearchParams(hash.slice(1))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      if (!accessToken || !refreshToken) return

      fetch('/api/auth/set-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
      }).then(async (res) => {
        if (res.ok) {
          const browserSupabase = createClient()
          await browserSupabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          window.location.replace('/dashboard')
        } else {
          const body = await res.json().catch(() => ({}))
          console.error('[auth] set-session failed', res.status, body)
        }
      }).catch((err) => {
        console.error('[auth] set-session error', err)
      })
    }
    handleAuthCallback()
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      const redirectTo = `${window.location.origin}/login`
      const res = await fetch(`${supabaseUrl}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          email,
          create_user: true,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.msg || data?.message || 'Something went wrong. Please try again.')
      }

      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 flex">
      {/* Left — Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-stone-950 via-stone-900 to-stone-950" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 30% 70%, #ea580c 0%, transparent 50%), radial-gradient(circle at 70% 20%, #9a3412 0%, transparent 50%)',
          }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <FlameIcon className="w-8 h-8 text-ember-500" />
            <span className="text-white font-semibold text-lg tracking-tight">Fireova Hub</span>
          </div>
        </div>
        <div className="relative z-10">
          <blockquote className="text-stone-300 text-lg leading-relaxed font-light mb-6">
            "Average catering is forgotten. Wood-fired is an experience."
          </blockquote>
          <p className="text-stone-500 text-sm">
            Your content operating system. Build posts that feel like Fireova.
          </p>
        </div>
        <div className="relative z-10">
          <p className="text-stone-600 text-xs">Fireova Pizza &mdash; Denton, TX</p>
        </div>
      </div>

      {/* Right — Login form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-stone-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <FlameIcon className="w-6 h-6 text-ember-600" />
            <span className="font-semibold text-stone-900">Fireova Hub</span>
          </div>

          {!sent ? (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold text-stone-900 mb-2">Sign in</h1>
                <p className="text-stone-500 text-sm">
                  Enter your email and we&apos;ll send you a magic link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="label">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@fireovapizza.com"
                    required
                    className="input"
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="btn-primary w-full justify-center py-2.5"
                >
                  {loading ? (
                    <>
                      <Spinner />
                      Sending...
                    </>
                  ) : (
                    'Send Magic Link'
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                <CheckIcon className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-xl font-semibold text-stone-900 mb-2">Check your email</h2>
              <p className="text-stone-500 text-sm mb-6">
                We sent a magic link to{' '}
                <strong className="text-stone-700">{email}</strong>. Click it to sign in.
              </p>
              <button
                onClick={() => {
                  setSent(false)
                  setEmail('')
                }}
                className="btn-ghost text-stone-500"
              >
                Use a different email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FlameIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
