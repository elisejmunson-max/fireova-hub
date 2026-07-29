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
  const [eventForm, setEventForm] = useState<EventDetailsForm>(() => createEventForm(value))
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState('')
  const savedFormRef = useRef<EventDetailsForm>(createEventForm(value))
  const eventFormRef = useRef(eventForm)
  const pendingFieldsRef = useRef(new Set<keyof EventDetailsForm>())
  const failedFieldsRef = useRef(new Set<keyof EventDetailsForm>())
  const requestRef = useRef<Promise<unknown> | null>(null)
  const nameTimerRef = useRef<number | null>(null)
  const statusTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const nextSavedForm = createEventForm(value)
    setEventForm((currentForm) => {
      const hasUnsavedChanges = (
        !formsMatch(currentForm, savedFormRef.current)
        || pendingFieldsRef.current.size > 0
        || Boolean(requestRef.current)
      )
      savedFormRef.current = nextSavedForm
      const nextForm = hasUnsavedChanges ? currentForm : nextSavedForm
      eventFormRef.current = nextForm
      return nextForm
    })
  }, [value.date, value.name, value.type, value.venueName])

  useEffect(() => () => {
    if (nameTimerRef.current) window.clearTimeout(nameTimerRef.current)
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
  }, [])

  function updateForm(updates: Partial<EventDetailsForm>) {
    const nextForm = { ...eventFormRef.current, ...updates }
    eventFormRef.current = nextForm
    setEventForm(nextForm)
    if (!requestRef.current && saveStatus !== 'idle') setSaveStatus('idle')
  }

  function buildUpdates(form: EventDetailsForm, fields: Set<keyof EventDetailsForm>) {
    const savedForm = savedFormRef.current
    const nextName = form.name.trim()
    const nextVenueName = form.venueName.trim()
    const updates: Partial<LocalEventMetadataUpdate> = {}
    if (fields.has('name') && nextName && nextName !== savedForm.name) updates.name = nextName
    if (fields.has('type') && form.type !== savedForm.type) updates.type = form.type
    if (fields.has('date') && form.date && form.date !== savedForm.date) {
      updates.date = dateValueMode === 'input' ? form.date : formatDateInputForDisplay(form.date)
    }
    if (fields.has('venueName') && nextVenueName !== savedForm.venueName) {
      const venue = venues.find((option) =>
        option.name.localeCompare(nextVenueName, undefined, { sensitivity: 'accent' }) === 0
      )
      Object.assign(updates, venue ? {
        venueName: venue.name,
        venueLocation: '',
        venueInstagram: venue.instagram ?? '',
        venueVendorId: venue.vendorId,
      } : {
        venueName: nextVenueName,
        venueLocation: '',
        venueInstagram: '',
        venueVendorId: undefined,
      })
    }
    return updates
  }

  function markFieldsSaved(form: EventDetailsForm, fields: Set<keyof EventDetailsForm>) {
    const nextSavedForm = { ...savedFormRef.current }
    fields.forEach((field) => {
      if (field === 'name') nextSavedForm.name = form.name.trim()
      else if (field === 'venueName') nextSavedForm.venueName = form.venueName.trim()
      else if (field === 'type') nextSavedForm.type = form.type
      else nextSavedForm.date = form.date
    })
    savedFormRef.current = nextSavedForm
  }

  function queueSave(field: keyof EventDetailsForm, delay = 0) {
    pendingFieldsRef.current.add(field)
    failedFieldsRef.current.delete(field)
    if (field === 'name' && nameTimerRef.current) window.clearTimeout(nameTimerRef.current)
    if (delay > 0) {
      nameTimerRef.current = window.setTimeout(() => {
        nameTimerRef.current = null
        void flushSaves()
      }, delay)
      return
    }
    void flushSaves()
  }

  async function flushSaves() {
    if (requestRef.current || pendingFieldsRef.current.size === 0) return
    const fields = new Set(pendingFieldsRef.current)
    pendingFieldsRef.current.clear()
    const formSnapshot = { ...eventFormRef.current }
    const updates = buildUpdates(formSnapshot, fields)
    if (Object.keys(updates).length === 0) {
      fields.forEach((field) => failedFieldsRef.current.delete(field))
      return
    }
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
    setSaveStatus('saving')
    setSaveError('')
    const request = onSave(updates)
    requestRef.current = request

    try {
      await request
      markFieldsSaved(formSnapshot, fields)
      fields.forEach((field) => failedFieldsRef.current.delete(field))
    } catch (error) {
      fields.forEach((field) => {
        pendingFieldsRef.current.add(field)
        failedFieldsRef.current.add(field)
      })
      setSaveStatus('error')
      setSaveError(error instanceof Error ? error.message : 'The event could not be saved.')
      return
    } finally {
      if (requestRef.current === request) requestRef.current = null
    }

    if (pendingFieldsRef.current.size > 0) {
      await flushSaves()
    }
    if (!requestRef.current && pendingFieldsRef.current.size === 0) {
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
      setSaveStatus('saved')
      statusTimerRef.current = window.setTimeout(() => {
        statusTimerRef.current = null
        setSaveStatus('idle')
      }, 1800)
    }
  }

  function retrySave() {
    failedFieldsRef.current.forEach((field) => pendingFieldsRef.current.add(field))
    void flushSaves()
  }

  const fieldClassName = 'min-h-11 w-full min-w-0 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-900 shadow-sm outline-none transition placeholder:text-stone-400 hover:border-stone-300 focus:border-stone-400 focus:ring-2 focus:ring-stone-200 disabled:cursor-wait disabled:bg-stone-50 disabled:text-stone-500'
  const labelClassName = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500'

  return (
    <div className="relative min-w-0 flex-1 pt-7 sm:pt-0" data-testid="inline-event-details-header">
      <div className="absolute right-0 top-0 min-h-5 text-xs font-semibold" aria-live="polite">
        {saveStatus === 'saving' && <span className="text-stone-500">Saving…</span>}
        {saveStatus === 'saved' && <span className="text-emerald-700">Saved</span>}
        {saveStatus === 'error' && (
          <span className="inline-flex items-center gap-2 text-red-600">
            Couldn&apos;t save
            <button
              type="button"
              onClick={retrySave}
              className="min-h-11 rounded-md px-2 text-xs font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            >
              Retry
            </button>
          </span>
        )}
      </div>
      <div data-testid="event-details-form">
          <div className="min-w-0">
            <label htmlFor="event-details-name" className={labelClassName}>Event name</label>
            <input
              id="event-details-name"
              value={eventForm.name}
              onChange={(event) => {
                updateForm({ name: event.target.value })
                queueSave('name', 700)
              }}
              onBlur={() => {
                if (nameTimerRef.current) window.clearTimeout(nameTimerRef.current)
                nameTimerRef.current = null
                void flushSaves()
              }}
              placeholder="Enter event name"
              className="min-h-12 w-full min-w-0 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[25px] font-semibold leading-tight tracking-[-0.02em] text-[#171717] shadow-sm outline-none transition placeholder:text-[22px] placeholder:font-normal placeholder:text-[#78716C] hover:border-stone-300 focus:border-stone-400 focus:ring-2 focus:ring-stone-200 disabled:cursor-wait disabled:bg-stone-50 md:text-[30px] md:placeholder:text-[26px]"
              aria-invalid={Boolean(nameError)}
            />
            {nameError && (
              <p className="mt-1 text-xs font-semibold text-red-600">{nameError}</p>
            )}
          </div>

          <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-3">
            <label className="min-w-0">
              <span className={labelClassName}>Event type</span>
              <select
                value={eventForm.type}
                onChange={(event) => {
                  updateForm({ type: event.target.value as FireovaEventType })
                  queueSave('type')
                }}
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
                onChange={(event) => {
                  updateForm({ date: event.target.value })
                  if (event.target.value) queueSave('date')
                }}
                className={`${fieldClassName} cursor-pointer`}
                aria-label="Event date"
              />
            </label>

            <div className="min-w-0">
              <label htmlFor="event-details-venue" className={labelClassName}>Venue</label>
              <VenueAutocomplete
                value={eventForm.venueName}
                venues={venues}
                placeholder="Select or add venue"
                ariaLabel="Venue"
                inputId="event-details-venue"
                inputClassName={`${fieldClassName} pr-9`}
                showAddNew
                onChange={(venueName) => {
                  updateForm({ venueName })
                  if (!venueName.trim()) queueSave('venueName')
                }}
                onSelect={(venue) => {
                  updateForm({ venueName: venue.name })
                  queueSave('venueName')
                }}
                onAddNew={(venueName) => {
                  updateForm({ venueName })
                  queueSave('venueName')
                }}
              />
            </div>
          </div>

          {saveStatus === 'error' && saveError && (
            <p className="mt-2 text-right text-xs text-red-600">{saveError}</p>
          )}
      </div>
    </div>
  )
}

function createEventForm(value: InlineEventDetailsValue): EventDetailsForm {
  return {
    name: value.name.trim() === 'Untitled Event' ? '' : value.name,
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

function formsMatch(left: EventDetailsForm, right: EventDetailsForm) {
  return (
    left.name.trim() === right.name
    && left.type === right.type
    && left.date === right.date
    && left.venueName.trim() === right.venueName
  )
}
