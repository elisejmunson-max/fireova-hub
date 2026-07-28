'use client'

import { useEffect, useRef, useState } from 'react'
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

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function InlineEventDetailsHeader({
  value,
  venues,
  onSave,
  dateValueMode = 'display',
  nameError,
}: InlineEventDetailsHeaderProps) {
  const [nameEditing, setNameEditing] = useState(false)
  const [typeEditing, setTypeEditing] = useState(false)
  const [dateEditing, setDateEditing] = useState(false)
  const [venueEditing, setVenueEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(value.name)
  const [typeDraft, setTypeDraft] = useState<FireovaEventType>(normalizeEventType(value.type))
  const [dateDraft, setDateDraft] = useState(toDateInputValue(value.date))
  const [venueDraft, setVenueDraft] = useState(value.venueName ? `name:${value.venueName}` : '')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState('')
  const typeSelectRef = useRef<HTMLSelectElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const venueSelectRef = useRef<HTMLSelectElement>(null)
  const requestRef = useRef<Promise<unknown> | null>(null)
  const requestKeyRef = useRef('')
  const lastUpdateRef = useRef<Partial<LocalEventMetadataUpdate> | null>(null)
  const statusTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!nameEditing) setNameDraft(value.name)
    if (!typeEditing) setTypeDraft(normalizeEventType(value.type))
    if (!dateEditing) setDateDraft(toDateInputValue(value.date))
    if (!venueEditing) setVenueDraft(value.venueName ? `name:${value.venueName}` : '')
  }, [dateEditing, nameEditing, typeEditing, value, venueEditing])

  useEffect(() => () => {
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
  }, [])

  useEffect(() => {
    if (!typeEditing) return
    typeSelectRef.current?.focus()
    try {
      ;(typeSelectRef.current as HTMLSelectElement & { showPicker?: () => void })?.showPicker?.()
    } catch {
      // Focused native selects remain directly usable when showPicker is unavailable.
    }
  }, [typeEditing])

  useEffect(() => {
    if (!dateEditing) return
    dateInputRef.current?.focus()
    try {
      dateInputRef.current?.showPicker?.()
    } catch {
      // The native date input remains directly usable when showPicker is unavailable.
    }
  }, [dateEditing])

  useEffect(() => {
    if (!venueEditing) return
    venueSelectRef.current?.focus()
    try {
      ;(venueSelectRef.current as HTMLSelectElement & { showPicker?: () => void })?.showPicker?.()
    } catch {
      // Focused native selects remain directly usable when showPicker is unavailable.
    }
  }, [venueEditing])

  async function save(updates: Partial<LocalEventMetadataUpdate>) {
    const requestKey = JSON.stringify(updates)
    if (requestRef.current && requestKeyRef.current === requestKey) return requestRef.current
    if (requestRef.current) await requestRef.current.catch(() => undefined)

    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current)
    setSaveStatus('saving')
    setSaveError('')
    lastUpdateRef.current = updates
    requestKeyRef.current = requestKey
    const request = onSave(updates)
    requestRef.current = request

    try {
      const result = await request
      setSaveStatus('saved')
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

  function saveName() {
    const nextName = nameDraft.trim()
    if (!nextName || nextName === value.name) {
      if (nextName) setNameEditing(false)
      return
    }
    void save({ name: nextName })
      .then(() => setNameEditing(false))
      .catch(() => undefined)
  }

  const saving = saveStatus === 'saving'
  const eventType = normalizeEventType(value.type)
  const displayDate = formatDisplayDate(value.date)

  return (
    <div className="min-w-0 flex-1" data-testid="inline-event-details-header">
      {nameEditing ? (
        <div className="flex min-w-0 items-center gap-2">
          <input
            autoFocus
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={saveName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                saveName()
              }
              if (event.key === 'Escape') {
                setNameDraft(value.name)
                setNameEditing(false)
              }
            }}
            className="min-h-11 min-w-0 flex-1 border-b border-stone-300 bg-transparent text-[28px] font-semibold leading-[1.05] tracking-[-0.035em] text-stone-950 outline-none focus:border-stone-950 md:text-[42px]"
            aria-label="Event name"
            aria-invalid={Boolean(nameError)}
          />
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={saveName}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-stone-700 hover:bg-stone-100"
            aria-label="Save event name"
          >
            ✓
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setNameDraft(value.name)
            setNameEditing(true)
          }}
          className="min-h-11 max-w-full rounded-md text-left text-[28px] font-semibold leading-[1.05] tracking-[-0.035em] text-stone-950 outline-none hover:text-stone-700 focus-visible:ring-2 focus-visible:ring-stone-950 disabled:opacity-70 md:text-[42px]"
          aria-label={`Edit event name: ${value.name}`}
        >
          {value.name}
        </button>
      )}
      {nameError && <p className="mt-1 text-xs font-semibold text-red-600">{nameError}</p>}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-1 text-sm font-medium text-stone-500">
        {typeEditing ? (
          <select
            ref={typeSelectRef}
            value={typeDraft}
            disabled={saving}
            onBlur={() => {
              if (!saving) setTypeEditing(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setTypeDraft(eventType)
                setTypeEditing(false)
              }
            }}
            onChange={(event) => {
              const nextType = event.target.value as FireovaEventType
              setTypeDraft(nextType)
              void save({ type: nextType }).then(() => setTypeEditing(false)).catch(() => undefined)
            }}
            className="min-h-11 max-w-[12rem] cursor-pointer rounded-md bg-white px-2 font-medium text-stone-700 outline-none ring-1 ring-stone-300 focus:ring-2 focus:ring-stone-950"
            aria-label="Event type"
          >
            {FIREOVA_EVENT_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => setTypeEditing(true)}
            className="min-h-11 rounded-md px-1 text-left font-medium text-stone-500 outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-stone-950 disabled:opacity-70"
            aria-label={`Change event type: ${eventType}`}
          >
            {eventType}
          </button>
        )}
        <span className="text-stone-300" aria-hidden="true">•</span>

        {dateEditing ? (
          <input
            ref={dateInputRef}
            type="date"
            value={dateDraft}
            disabled={saving}
            onBlur={() => {
              if (!saving) setDateEditing(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setDateDraft(toDateInputValue(value.date))
                setDateEditing(false)
              }
            }}
            onChange={(event) => {
              const nextDate = event.target.value
              setDateDraft(nextDate)
              if (!nextDate) return
              const storedDate = dateValueMode === 'input' ? nextDate : formatDateInputForDisplay(nextDate)
              void save({ date: storedDate }).then(() => setDateEditing(false)).catch(() => undefined)
            }}
            className="min-h-11 cursor-pointer rounded-md bg-white px-2 font-medium text-stone-700 outline-none ring-1 ring-stone-300 focus:ring-2 focus:ring-stone-950"
            aria-label="Event date"
          />
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => setDateEditing(true)}
            className="min-h-11 rounded-md px-1 text-left font-medium text-stone-500 outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-stone-950 disabled:opacity-70"
            aria-label={`Change event date: ${displayDate}`}
          >
            {displayDate}
          </button>
        )}
        <span className="text-stone-300" aria-hidden="true">•</span>

        {venueEditing ? (
          <select
            ref={venueSelectRef}
            value={venueDraft}
            disabled={saving}
            onBlur={() => {
              if (!saving) setVenueEditing(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setVenueDraft(value.venueName ? `name:${value.venueName}` : '')
                setVenueEditing(false)
              }
            }}
            onChange={(event) => {
              const nextValue = event.target.value
              setVenueDraft(nextValue)
              const venue = venues.find((option) => `name:${option.name}` === nextValue)
              const updates = venue ? {
                venueName: venue.name,
                venueLocation: '',
                venueInstagram: venue.instagram ?? '',
                venueVendorId: venue.vendorId,
              } : {
                venueName: '',
                venueLocation: '',
                venueInstagram: '',
                venueVendorId: undefined,
              }
              void save(updates).then(() => setVenueEditing(false)).catch(() => undefined)
            }}
            className="min-h-11 max-w-full cursor-pointer rounded-md bg-white px-2 font-medium text-stone-700 outline-none ring-1 ring-stone-300 focus:ring-2 focus:ring-stone-950"
            aria-label="Venue"
          >
            <option value="">{value.venueName ? 'Remove venue' : 'Choose venue'}</option>
            {value.venueName && !venues.some((option) => option.name === value.venueName) && (
              <option value={`name:${value.venueName}`}>{value.venueName}</option>
            )}
            {venues.map((option) => <option key={option.name} value={`name:${option.name}`}>{option.name}</option>)}
          </select>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => setVenueEditing(true)}
            className="min-h-11 max-w-full rounded-md px-1 text-left font-medium text-stone-500 outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-stone-950 disabled:opacity-70"
            aria-label={value.venueName ? `Change or remove venue: ${value.venueName}` : 'Add venue'}
          >
            {value.venueName || '+ Add venue'}
          </button>
        )}
      </div>

      <div className="min-h-5 pt-0.5 text-xs font-semibold" aria-live="polite">
        {saveStatus === 'saving' && <span className="text-stone-400">Saving…</span>}
        {saveStatus === 'saved' && <span className="text-emerald-700">Saved</span>}
        {saveStatus === 'error' && (
          <span className="text-red-600">
            {saveError}{' '}
            <button
              type="button"
              onClick={() => {
                if (lastUpdateRef.current) void save(lastUpdateRef.current).catch(() => undefined)
              }}
              className="min-h-11 underline underline-offset-2"
            >
              Retry
            </button>
          </span>
        )}
      </div>
    </div>
  )
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
