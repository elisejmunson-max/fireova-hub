'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function RootPage() {
  useEffect(() => {
    async function handleAuth() {
      const hash = window.location.hash
      const searchParams = new URLSearchParams(window.location.search)
      const code = searchParams.get('code')

      // PKCE flow — exchange code for session
      if (code) {
        const supabase = createClient()
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
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
          return
        }
      }

      // Implicit flow — tokens in hash
      if (hash.includes('access_token')) {
        const params = new URLSearchParams(hash.slice(1))
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        if (accessToken && refreshToken) {
          await fetch('/api/auth/set-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
          })
          const supabase = createClient()
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          window.location.replace('/dashboard')
          return
        }
      }

      // No auth tokens — go to dashboard (middleware will redirect to login if not authed)
      window.location.replace('/dashboard')
    }

    handleAuth()
  }, [])

  return null
}
