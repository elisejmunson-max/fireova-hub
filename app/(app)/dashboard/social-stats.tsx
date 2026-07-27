'use client'

import { useState, useEffect } from 'react'

const LS_KEY = 'fireova_social_stats'

interface Platform {
  id: string
  name: string
  url: string
  followers: number | null  // null = loading, -1 = manual mode
  liveCount: number | null  // count pulled from API
  color: string
  iconBg: string
  borderHover: string
}

const DEFAULTS: Omit<Platform, 'followers' | 'liveCount'>[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    url: 'https://www.instagram.com/fireovapizza/',
    color: 'text-pink-600',
    iconBg: 'bg-pink-50',
    borderHover: 'hover:border-pink-200',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    url: 'https://www.facebook.com/fireovapizza/',
    color: 'text-blue-600',
    iconBg: 'bg-blue-50',
    borderHover: 'hover:border-blue-200',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    url: 'https://www.tiktok.com/@fireovapizza',
    color: 'text-stone-900',
    iconBg: 'bg-stone-100',
    borderHover: 'hover:border-stone-300',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    url: 'https://www.youtube.com/@fireovapizza',
    color: 'text-red-600',
    iconBg: 'bg-red-50',
    borderHover: 'hover:border-red-200',
  },
]

function formatFollowers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return n.toLocaleString()
}

type StoredData = Record<string, { manual?: number }>

export default function SocialStats() {
  const [platforms, setPlatforms] = useState<Platform[]>(
    DEFAULTS.map((d) => ({ ...d, followers: null, liveCount: null }))
  )
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editValue, setEditValue]   = useState('')

  // Load stored manual counts + fetch live counts
  useEffect(() => {
    // 1. Load manual fallback counts from localStorage
    let stored: StoredData = {}
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) stored = JSON.parse(raw)
    } catch {}

    setPlatforms(DEFAULTS.map((d) => ({
      ...d,
      followers: stored[d.id]?.manual ?? 0,
      liveCount: null,
    })))

    // 2. Fetch live counts from our API route
    fetch('/api/social-stats')
      .then((r) => r.json())
      .then((data: Record<string, number | null>) => {
        setPlatforms((prev) => prev.map((p) => ({
          ...p,
          liveCount: data[p.id] ?? null,
          // Use live count as the displayed count if available
          followers: data[p.id] ?? p.followers,
        })))
      })
      .catch(() => {}) // silently fall back to manual
  }, [])

  function startEdit(id: string) {
    const p = platforms.find((x) => x.id === id)
    const current = p?.liveCount ?? p?.followers ?? 0
    setEditingId(id)
    setEditValue(current === 0 ? '' : String(current))
  }

  function commitEdit(id: string) {
    const num = parseInt(editValue.replace(/[^0-9]/g, ''), 10)
    const value = isNaN(num) ? 0 : num
    setPlatforms((prev) => prev.map((p) => p.id === id ? { ...p, followers: value, liveCount: null } : p))
    setEditingId(null)
    // Save manual override to localStorage
    try {
      const raw = localStorage.getItem(LS_KEY)
      const stored: StoredData = raw ? JSON.parse(raw) : {}
      stored[id] = { manual: value }
      localStorage.setItem(LS_KEY, JSON.stringify(stored))
    } catch {}
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {platforms.map((p) => {
        const displayCount = p.liveCount ?? p.followers ?? 0
        const isLive = p.liveCount !== null
        const isEditing = editingId === p.id

        return (
          <div key={p.id} className={`card p-5 transition-colors ${p.borderHover}`}>
            {/* Platform header */}
            <div className="flex items-center justify-between mb-4">
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 group/link"
                title={`Open ${p.name}`}
              >
                <div className={`${p.iconBg} rounded-lg p-1.5`}>
                  <PlatformIcon id={p.id} className={`w-4 h-4 ${p.color}`} />
                </div>
                <span className="text-xs font-semibold text-stone-700 group-hover/link:text-ember-600 transition-colors">
                  {p.name}
                </span>
                <ExternalLinkIcon className="w-3 h-3 text-stone-300 group-hover/link:text-ember-500 transition-colors" />
              </a>

              <div className="flex items-center gap-1.5">
                {isLive && (
                  <span className="text-[10px] text-emerald-500 font-medium">Live</span>
                )}
                {!isLive && (
                  <button
                    onClick={() => startEdit(p.id)}
                    className="text-[10px] text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Count */}
            {isEditing ? (
              <div>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => commitEdit(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit(p.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  placeholder="e.g. 4200"
                  className="input text-2xl font-semibold py-0.5 w-full"
                  autoFocus
                />
                <p className="text-[10px] text-stone-400 mt-1">Press Enter to save</p>
              </div>
            ) : (
              <button
                onClick={() => !isLive && startEdit(p.id)}
                className={`block text-left w-full ${!isLive ? 'group/count cursor-pointer' : 'cursor-default'}`}
                disabled={isLive}
                title={isLive ? undefined : 'Click to update'}
              >
                {p.followers === null ? (
                  // Loading state
                  <div className="h-9 w-20 bg-stone-100 rounded animate-pulse" />
                ) : displayCount === 0 ? (
                  <span className="text-stone-300 text-xl">
                    {isLive ? '0' : 'Add count'}
                  </span>
                ) : (
                  <p className="text-3xl font-semibold text-stone-900 group-hover/count:text-ember-600 transition-colors">
                    {formatFollowers(displayCount)}
                  </p>
                )}
                <p className="text-[11px] text-stone-400 mt-1">
                  {isLive ? 'followers · updates hourly' : 'followers'}
                </p>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PlatformIcon({ id, className }: { id: string; className?: string }) {
  if (id === 'instagram') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    )
  }
  if (id === 'facebook') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    )
  }
  if (id === 'tiktok') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.73a8.18 8.18 0 004.78 1.53V6.79a4.85 4.85 0 01-1.01-.1z"/>
      </svg>
    )
  }
  if (id === 'youtube') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    )
  }
  return null
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  )
}
