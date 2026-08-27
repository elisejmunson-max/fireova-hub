'use client'

import { createClient, supabaseConfigured } from '@/lib/supabase/client'
import {
  readLocalEvents,
  writeLocalEvents,
  type LocalFireovaEvent,
} from '@/lib/local-fireova-events'

export const FIREOVA_CLOUD_ERROR_EVENT = 'fireova-cloud-error'
const PHASE1_MIGRATION_MARKER = 'fireova-phase1-canonical-migration-v1'

function isSharedEvent(value: unknown): value is LocalFireovaEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<LocalFireovaEvent>
  return (
    typeof event.id === 'string' &&
    typeof event.name === 'string' &&
    typeof event.type === 'string' &&
    typeof event.date === 'string' &&
    typeof event.createdAt === 'string' &&
    Array.isArray(event.media)
  )
}

function notifyCloudError(message: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FIREOVA_CLOUD_ERROR_EVENT, { detail: { message } }))
}

async function readResponse(response: Response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Fireova could not reach your cloud account.')
  return body
}

export async function saveEventToCloud(event: LocalFireovaEvent, migrationOnly = false) {
  const response = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: event.id,
      data: event,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt ?? event.createdAt,
      migrationOnly,
    }),
  })
  try {
    const result = await readResponse(response)
    if (!isSharedEvent(result.event)) throw new Error('The cloud returned an invalid event.')
    return result.event
  } catch (error) {
    notifyCloudError(error instanceof Error ? error.message : 'The event could not be saved.')
    throw error
  }
}

export async function loadEventFromCloud(eventId: string) {
  try {
    const result = await readResponse(await fetch(`/api/events?id=${encodeURIComponent(eventId)}`, {
      cache: 'no-store',
    }))
    const event = Array.isArray(result.events) ? result.events[0] : null
    if (!isSharedEvent(event) || event.id !== eventId) {
      throw new Error('The saved event could not be confirmed in Fireova Cloud.')
    }
    return event
  } catch (error) {
    notifyCloudError(error instanceof Error ? error.message : 'The saved event could not be confirmed.')
    throw error
  }
}

export async function deleteEventFromCloud(eventId: string) {
  try {
    await readResponse(await fetch(`/api/events?id=${encodeURIComponent(eventId)}`, { method: 'DELETE' }))
  } catch (error) {
    notifyCloudError(error instanceof Error ? error.message : 'The event could not be deleted.')
    throw error
  }
}

async function migrateLocalEventsOnce() {
  if (typeof window === 'undefined' || window.localStorage.getItem(PHASE1_MIGRATION_MARKER) === 'complete') return
  const localEvents = readLocalEvents()
  const migrated: LocalFireovaEvent[] = []
  for (const event of localEvents) {
    migrated.push(await saveEventToCloud(event, true))
  }
  if (migrated.length) writeLocalEvents(migrated, { source: 'cloud' })
  window.localStorage.setItem(PHASE1_MIGRATION_MARKER, 'complete')
}

export async function syncEventsWithCloud() {
  if (!supabaseConfigured) throw new Error('Fireova cloud configuration is unavailable.')
  await migrateLocalEventsOnce()
  try {
    const result = await readResponse(await fetch('/api/events', { cache: 'no-store' }))
    const events = Array.isArray(result.events) ? result.events.filter(isSharedEvent) : []
    writeLocalEvents(events, { source: 'cloud' })
    return events
  } catch (error) {
    notifyCloudError(error instanceof Error ? error.message : 'Events could not be refreshed.')
    throw error
  }
}

// Kept temporarily for call-site compatibility. Automatic local-to-cloud
// reconciliation is deliberately disabled: explicit cloud writes are required.
export async function pushLocalEventsToCloud() {
  throw new Error('Automatic local event reconciliation is disabled in Phase 1.')
}

export async function subscribeToCloudEvents(onChange: () => void) {
  if (!supabaseConfigured) return () => undefined
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return () => undefined
  const channel = supabase
    .channel(`canonical-events-${user.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'event_projects',
      filter: `user_id=eq.${user.id}`,
    }, onChange)
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}
