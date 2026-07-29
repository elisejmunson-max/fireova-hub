'use client'

import { useEffect, useRef, useState } from 'react'
import VenueAutocomplete from '@/components/events/venue-autocomplete'
import {
  FIREOVA_EVENT_TYPES,
  normalizeEventType,
  type FireovaEventType,
  type LocalEventMetadataUpdate,
} from '@/lib/local-fireova-events'
import type { SavedVenueOption } from '@/lib/local-fireova-venues'

export type InlineEventDetailsValue = Pick<
  LocalEventMetadataUpdate,
  'name' | 'type' | 'date' | 'venueName' | 'venueLocation' | 'venueInstagram' | 'venueVendorId'
>

type InlineEventDetailsHeaderProps = {
  value: InlineEventDetailsValue
  venues: SavedVenueOption[]
  onSave: (updates: Partial<LocalEventMetadataUpdate>) => Promise<unknown>
  dateValueMode?: 'display' | 'input'
  nameError?: string
}

type EventDetailsForm = {
  name: string
  type: FireovaEventType
  date: string
  venueName: string
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function InlineEventDetailsHeader({
  value,
  venues,
  onSave,
  dateValueMode = 'display',
  nameError,
}: InlineEventDetailsHeaderProps) {
  const [isEditingEvent, setIsEditingEvent] = useState(false)
  const [eventForm, setEventForm] = useState<EventDetailsForm>(() => createEventForm(value))
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState('')
  const requestRef = useRef<Promise<unknown> | null>(null)
  const requestKeyRef = useRef('')
  const statusTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isEditingEvent) setEventForm(createEventForm(value))
  }, [isEditingEvent, value.date, value.name, value.type, value.venueName])

  useEffect(() => () => {
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
  }, [])

  const savedForm = createEventForm(value)
  const trimmedName = eventForm.name.trim()
  const trimmedVenueName = eventForm.venueName.trim()
  const hasChanges = (
    trimmedName !== savedForm.name
    || eventForm.type !== savedForm.type
    || eventForm.date !== savedForm.date
    || trimmedVenueName !== savedForm.venueName
  )
  const saving = saveStatus === 'saving'
  const canSave = hasChanges && Boolean(trimmedName) && Boolean(eventForm.date) && !saving

  function beginEditing() {
    setEventForm(savedForm)
    setSaveError('')
    setSaveStatus('idle')
    setIsEditingEvent(true)
  }

  function cancelEditing() {
    setEventForm(savedForm)
    setSaveError('')
    setSaveStatus('idle')
    setIsEditingEvent(false)
  }

  function updateForm(updates: Partial<EventDetailsForm>) {
    setEventForm((current) => ({ ...current, ...updates }))
    if (saveStatus !== 'idle') setSaveStatus('idle')
  }

  function buildUpdates() {
    const updates: Partial<LocalEventMetadataUpdate> = {}
    if (trimmedName !== savedForm.name) updates.name = trimmedName
    if (eventForm.type !== savedForm.type) updates.type = eventForm.type
    if (eventForm.date !== savedForm.date) {
      updates.date = dateValueMode === 'input' ? eventForm.date : formatDateInputForDisplay(eventForm.date)
    }
    if (trimmedVenueName !== savedForm.venueName) {
      const venue = venues.find((option) =>
        option.name.localeCompare(trimmedVenueName, undefined, { sensitivity: 'accent' }) === 0
      )
      Object.assign(updates, venue ? {
        venueName: venue.name,
        venueLocation: '',
        venueInstagram: venue.instagram ?? '',
        venueVendorId: venue.vendorId,
      } : {
        venueName: trimmedVenueName,
        venueLocation: '',
        venueInstagram: '',
        venueVendorId: undefined,
      })
    }
    return updates
  }

  async function saveChanges() {
    if (!canSave) return
    const updates = buildUpdates()
    const requestKey = JSON.stringify(updates)
    if (requestRef.current && requestKeyRef.current === requestKey) return requestRef.current
    if (requestRef.current) await requestRef.current.catch(() => undefined)

    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
    setSaveStatus('saving')
    setSaveError('')
    requestKeyRef.current = requestKey
    const request = onSave(updates)
    requestRef.current = request

    try {
      const result = await request
      setSaveStatus('saved')
      setIsEditingEvent(false)
      statusTimerRef.current = window.setTimeout(() => setSaveStatus('idle'), 1800)
      return result
    } catch (error) {
      setSaveStatus('error')
      setSaveError(error instanceof Error ? error.message : 'The event could not be saved to Fireova Cloud.')
      throw error
    } finally {
      if (requestRef.current === request) requestRef.current = null
    }
  }

  const fieldClassName = 'min-h-11 w-full min-w-0 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-900 shadow-sm outline-none transition placeholder:text-stone-400 hover:border-stone-300 focus:border-stone-400 focus:ring-2 focus:ring-stone-200 disabled:cursor-wait disabled:bg-stone-50 disabled:text-stone-500'
  const labelClassName = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500'

  return (
    <div className="min-w-0 flex-1" data-testid="inline-event-details-header">
      {!isEditingEvent ? (
        <div data-testid="event-details-read-mode">
          <p className="max-w-full break-words text-[28px] font-semibold leading-tight tracking-[-0.025em] text-stone-950 md:text-[34px]">
            {value.name || 'Untitled Event'}
          </p>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-stone-500">
            <span>{normalizeEventType(value.type)}</span>
            <span className="text-stone-300" aria-hidden="true">·</span>
            <span>{formatDisplayDate(value.date)}</span>
            <span className="text-stone-300" aria-hidden="true">·</span>
            <span className="min-w-0 break-words">{value.venueName || 'No venue'}</span>
          </div>
          <div className="mt-4 flex min-w-0 items-center justify-end gap-3">
            <div className="min-h-5 text-xs font-semibold" aria-live="polite">
              {saveStatus === 'saved' && <span className="text-emerald-700">Saved</span>}
            </div>
            <button
              type="button"
              onClick={beginEditing}
              className="min-h-11 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950 focus-visible:ring-offset-2"
            >
              Edit event
            </button>
          </div>
        </div>
      ) : (
        <div data-testid="event-details-edit-mode">
          <div className="min-w-0">
            <label htmlFor="event-details-name" className={labelClassName}>Event name</label>
            <input
              id="event-details-name"
              value={eventForm.name}
              disabled={saving}
              onChange={(event) => updateForm({ name: event.target.value })}
              placeholder="Untitled Event"
              className="min-h-12 w-full min-w-0 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[24px] font-semibold leading-tight tracking-[-0.02em] text-stone-950 shadow-sm outline-none transition placeholder:text-stone-300 hover:border-stone-300 focus:border-stone-400 focus:ring-2 focus:ring-stone-200 disabled:cursor-wait disabled:bg-stone-50 md:text-[30px]"
              aria-invalid={Boolean(nameError) || !trimmedName}
            />
            {(nameError || !trimmedName) && (
              <p className="mt-1 text-xs font-semibold text-red-600">{nameError || 'Enter an event name.'}</p>
            )}
          </div>

          <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-3">
            <label className="min-w-0">
              <span className={labelClassName}>Event type</span>
              <select
                value={eventForm.type}
                disabled={saving}
                onChange={(event) => updateForm({ type: event.target.value as FireovaEventType })}
                className={`${fieldClassName} cursor-pointer`}
                aria-label="Event type"
              >
                {FIREOVA_EVENT_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>

            <label className="min-w-0">
              <span className={labelClassName}>Event date</span>
              <input
                type="date"
                value={eventForm.date}
                disabled={saving}
                onChange={(event) => updateForm({ date: event.target.value })}
                className={`${fieldClassName} cursor-pointer`}
                aria-label="Event date"
              />
            </label>

            <div className="min-w-0">
              <label htmlFor="event-details-venue" className={labelClassName}>Venue</label>
              <VenueAutocomplete
                value={eventForm.venueName}
                venues={venues}
                disabled={saving}
                placeholder="Select or add venue"
                ariaLabel="Venue"
                inputId="event-details-venue"
                inputClassName={`${fieldClassName} pr-9`}
                showAddNew
                onChange={(venueName) => updateForm({ venueName })}
                onSelect={(venue) => updateForm({ venueName: venue.name })}
                onAddNew={(venueName) => updateForm({ venueName })}
              />
            </div>
          </div>

          <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="min-h-5 min-w-0 text-xs font-semibold sm:mr-1 sm:text-right" aria-live="polite">
              {saveStatus === 'error' && <span className="text-red-600">{saveError}</span>}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={cancelEditing}
              className="min-h-11 w-full rounded-lg border border-stone-200 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => void saveChanges().catch(() => undefined)}
              className="min-h-11 w-full rounded-lg bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500 sm:w-auto"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function createEventForm(value: InlineEventDetailsValue): EventDetailsForm {
  return {
    name: value.name,
    type: normalizeEventType(value.type),
    date: toDateInputValue(value.date),
    venueName: value.venueName?.trim() ?? '',
  }
}

function toDateInputValue(value: string) {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateInputForDisplay(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDisplayDate(value: string) {
  const inputValue = toDateInputValue(value)
  return inputValue ? formatDateInputForDisplay(inputValue) : value
}
