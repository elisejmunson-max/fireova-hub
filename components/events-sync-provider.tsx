'use client'

import { useEffect, useState } from 'react'
import {
  FIREOVA_CLOUD_ERROR_EVENT,
  subscribeToCloudEvents,
  syncEventsWithCloud,
} from '@/lib/shared-fireova-events'

export default function EventsSyncProvider() {
  const [cloudError, setCloudError] = useState('')

  useEffect(() => {
    let active = true
    let unsubscribe: () => void = () => undefined

    const sync = () => {
      void syncEventsWithCloud().catch((error) => {
        console.error('[Fireova Events Sync] Cloud refresh failed.', error)
      })
    }

    sync()
    void subscribeToCloudEvents(sync).then((cleanup) => {
      if (active) unsubscribe = cleanup
      else cleanup()
    }).catch((error) => {
      console.warn('[Fireova Events Sync] Live updates unavailable.', error)
    })

    const handleFocus = () => sync()
    const handleCloudError = (event: Event) => {
      setCloudError((event as CustomEvent<{ message?: string }>).detail?.message || 'Fireova could not save to your account.')
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') sync()
    }
    window.addEventListener('focus', handleFocus)
    window.addEventListener(FIREOVA_CLOUD_ERROR_EVENT, handleCloudError)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      active = false
      unsubscribe()
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener(FIREOVA_CLOUD_ERROR_EVENT, handleCloudError)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  if (!cloudError) return null
  return (
    <div role="alert" className="fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-xl items-center justify-between gap-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 shadow-xl ring-1 ring-red-200">
      <span>{cloudError}</span>
      <button type="button" onClick={() => setCloudError('')} className="shrink-0 rounded-full px-3 py-1 text-xs ring-1 ring-red-200">
        Dismiss
      </button>
    </div>
  )
}
