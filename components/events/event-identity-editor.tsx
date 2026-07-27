'use client'

import VenueAutocomplete from '@/components/events/venue-autocomplete'
import { FIREOVA_EVENT_TYPES, type FireovaEventType } from '@/lib/local-fireova-events'
import type { SavedVenueOption } from '@/lib/local-fireova-venues'

export default function EventIdentityEditor({ name, date, type, venueName, venues, disabled = false, nameError, onNameChange, onDateChange, onTypeChange, onVenueChange, onVenueSelect, onDone, onCancel }: {
  name: string
  date: string
  type: FireovaEventType
  venueName: string
  venues: SavedVenueOption[]
  disabled?: boolean
  nameError?: string
  onNameChange: (value: string) => void
  onDateChange: (value: string) => void
  onTypeChange: (value: FireovaEventType) => void
  onVenueChange: (value: string) => void
  onVenueSelect: (venue: SavedVenueOption) => void
  onDone: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-3" data-testid="event-identity-editor">
      <div className="flex items-start gap-3">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Event Name</span>
          <input value={name} disabled={disabled} onChange={(event) => onNameChange(event.target.value)} className={`w-full border-b bg-transparent pb-1 text-2xl font-semibold tracking-[-0.03em] text-stone-950 outline-none transition ${nameError ? 'border-red-300' : 'border-stone-200 focus:border-stone-800'}`} aria-invalid={Boolean(nameError)} />
          {nameError && <p className="mt-1 text-xs font-semibold text-red-600">{nameError}</p>}
        </label>
        <div className="flex shrink-0 items-center gap-2 pt-1"><button type="button" onClick={onDone} className="rounded-md px-2 py-1 text-xs font-semibold text-stone-900 hover:bg-stone-100">Done</button><button type="button" onClick={onCancel} className="rounded-md px-2 py-1 text-xs font-semibold text-stone-500 hover:bg-stone-100">Cancel</button></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={type} disabled={disabled} onChange={(event) => onTypeChange(event.target.value as FireovaEventType)} className="min-h-9 rounded-lg bg-white px-3 text-sm ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-900" aria-label="Event Type">{FIREOVA_EVENT_TYPES.map((eventType) => <option key={eventType} value={eventType}>{eventType}</option>)}</select>
        <input type="date" value={date} disabled={disabled} onChange={(event) => onDateChange(event.target.value)} className="min-h-9 rounded-lg bg-white px-3 text-sm ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-900" aria-label="Event Date" />
      </div>
      <VenueAutocomplete value={venueName} venues={venues} disabled={disabled} onChange={onVenueChange} onSelect={onVenueSelect} />
    </div>
  )
}
