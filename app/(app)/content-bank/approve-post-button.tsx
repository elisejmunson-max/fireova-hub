'use client'

// Shared localStorage helpers — imported by other client components
export const LS_APPROVED_KEY = 'fireova_approved_posts'
export const LS_REVIEW_KEY = 'fireova_review_posts'

export function getSet(key: string): Set<string> {
  try {
    const stored = localStorage.getItem(key)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

export function saveSet(key: string, ids: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...ids]))
}
