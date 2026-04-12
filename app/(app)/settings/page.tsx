'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [form, setForm] = useState({ full_name: '', business_name: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const userId = user?.id ?? 'dev'

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (data) {
        setProfile(data)
        setForm({
          full_name: data.full_name ?? '',
          business_name: data.business_name ?? '',
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id ?? 'dev'

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name || null,
        business_name: form.business_name || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (error) {
      setError(error.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div className="h-7 w-32 bg-stone-200 rounded animate-pulse" />
        </div>
        <div className="page-content space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="card p-5 space-y-4">
              <div className="h-4 w-24 bg-stone-200 rounded animate-pulse" />
              <div className="h-10 bg-stone-100 rounded-lg animate-pulse" />
              <div className="h-10 bg-stone-100 rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="text-xl font-semibold text-stone-900">Settings</h1>
        <p className="text-stone-500 text-sm mt-0.5">Manage your profile and workspace.</p>
      </div>

      <div className="page-content max-w-2xl space-y-6">
        {/* Profile */}
        <form onSubmit={handleSave} className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-stone-900">Profile</h2>

          <div>
            <label className="label">Email</label>
            <input
              type="text"
              value={profile?.email ?? ''}
              disabled
              className="input bg-stone-50 text-stone-400 cursor-not-allowed"
            />
            <p className="text-xs text-stone-400 mt-1">Email is managed through your login.</p>
          </div>

          <div>
            <label className="label">Full Name</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
              placeholder="Your name"
              className="input"
            />
          </div>

          <div>
            <label className="label">Business Name</label>
            <input
              type="text"
              value={form.business_name}
              onChange={(e) => setForm((prev) => ({ ...prev, business_name: e.target.value }))}
              placeholder="Fireova Pizza"
              className="input"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <Spinner /> : null}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {saved && (
              <span className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
                <CheckIcon className="w-4 h-4" />
                Saved
              </span>
            )}
          </div>
        </form>

        {/* Brand voice reference */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-stone-900 mb-1">Brand Voice Reference</h2>
          <p className="text-xs text-stone-500 mb-4">
            Core guidelines for every Fireova post. These inform all content created in this hub.
          </p>
          <div className="space-y-3">
            {BRAND_RULES.map(({ rule, note }) => (
              <div key={rule} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-ember-500 mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-stone-700 font-medium">{rule}</p>
                  {note && <p className="text-xs text-stone-400 mt-0.5">{note}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Account */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-stone-900 mb-4">Account</h2>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

const BRAND_RULES = [
  { rule: 'No em dashes, ever.', note: 'Use commas, periods, or parentheses instead.' },
  { rule: 'No emojis in captions.', note: 'Unless specifically asked.' },
  { rule: 'No hype words.', note: 'Amazing, incredible, best ever, game-changer, elevate, unforgettable.' },
  { rule: 'Always tie food back to the experience.', note: 'Guests, warmth, gathering.' },
  { rule: 'Every post: two options.', note: 'Instagram/Facebook (warm, flowing) and TikTok (short, punchy).' },
  { rule: 'Exactly 4 hashtags per post.', note: 'Mix broad and niche from the pool.' },
  { rule: 'Post every other day.', note: '1-2 Reels per week.' },
]

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
