'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  mobileActions?: ReactNode
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
  mobileActions,
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

  const fieldClassName = 'h-[52px] w-full min-w-0 rounded-xl border border-[#E5E7EB] bg-white px-4 pb-1 pt-5 text-base font-medium text-stone-900 shadow-sm outline-none transition placeholder:text-base placeholder:text-stone-400 hover:border-stone-300 focus:border-stone-400 focus:ring-2 focus:ring-stone-200 disabled:cursor-wait disabled:bg-stone-50 disabled:text-stone-500 md:h-auto md:min-h-11 md:rounded-lg md:border-stone-200 md:px-3 md:py-0 md:text-sm md:placeholder:text-sm'
  const labelClassName = 'pointer-events-none absolute left-4 top-2 z-10 text-[11px] font-semibold uppercase tracking-[0.05em] text-stone-500 md:static md:mb-1.5 md:block md:text-[11px] md:tracking-[0.06em]'

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
          <div className="relative min-w-0">
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
              className="h-[52px] w-full min-w-0 rounded-xl border border-[#E5E7EB] bg-white px-4 pb-1 pt-5 text-base font-semibold leading-tight text-[#171717] shadow-sm outline-none transition placeholder:text-base placeholder:font-normal placeholder:text-[#78716C] hover:border-stone-300 focus:border-stone-400 focus:ring-2 focus:ring-stone-200 disabled:cursor-wait disabled:bg-stone-50 md:h-auto md:min-h-12 md:rounded-lg md:border-stone-200 md:px-3 md:py-2 md:text-[30px] md:tracking-[-0.02em] md:placeholder:text-[26px]"
              aria-invalid={Boolean(nameError)}
            />
            {nameError && (
              <p className="mt-1 text-xs font-semibold text-red-600">{nameError}</p>
            )}
          </div>

          <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-3 md:gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-3 md:gap-2">
                <div className="relative min-w-0 flex-1">
                  <label htmlFor="event-details-type" className={labelClassName}>Event type</label>
                  <select
                    id="event-details-type"
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
                </div>
                {mobileActions}
              </div>
            </div>

            <div className="relative min-w-0">
              <label htmlFor="event-details-date" className={`${labelClassName} left-12 md:left-auto`}>Event date</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-stone-500 md:hidden" aria-hidden="true">
                  <CalendarIcon />
                </span>
                <input
                  id="event-details-date"
                  type="date"
                  value={eventForm.date}
                  onChange={(event) => {
                    updateForm({ date: event.target.value })
                    if (event.target.value) queueSave('date')
                  }}
                  className={`${fieldClassName} cursor-pointer pl-12 pr-10 text-left [text-align:left] [&::-webkit-calendar-picker-indicator]:opacity-0 md:px-3 md:[&::-webkit-calendar-picker-indicator]:opacity-100`}
                  aria-label="Event date"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400 md:hidden" aria-hidden="true">⌄</span>
              </div>
            </div>

            <div className="relative min-w-0">
              <label htmlFor="event-details-venue" className={labelClassName}>Venue</label>
              <VenueAutocomplete
                value={eventForm.venueName}
                venues={venues}
                placeholder="Select or add venue"
                ariaLabel="Venue"
                inputId="event-details-venue"
                inputClassName={`${fieldClassName} pr-10`}
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

function CalendarIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3v3m10-3v3M4.5 9.5h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
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
