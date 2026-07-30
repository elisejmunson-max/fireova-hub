'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createCloudVenue, loadCloudVenues } from '@/lib/cloud-venues'
import { normalizeVenueName, searchSavedVenues, type SavedVenueOption } from '@/lib/local-fireova-venues'

type VenueSelectionWorkflowProps = {
  value: string
  venues: SavedVenueOption[]
  disabled?: boolean
  inputId?: string
  buttonClassName?: string
  placeholder?: string
  mobilePlaceholder?: string
  onSelect: (venue: SavedVenueOption) => void
}

type NewVenueForm = {
  name: string
  location: string
  notes: string
}

const EMPTY_VENUE_FORM: NewVenueForm = { name: '', location: '', notes: '' }

export default function VenueSelectionWorkflow({
  value,
  venues,
  disabled = false,
  inputId,
  buttonClassName,
  placeholder = 'Select or add venue',
  mobilePlaceholder = 'Venue',
  onSelect,
}: VenueSelectionWorkflowProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'list' | 'add'>('list')
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [availableVenues, setAvailableVenues] = useState(() => mergeVenueOptions(venues))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [newVenue, setNewVenue] = useState<NewVenueForm>(EMPTY_VENUE_FORM)
  const searchRef = useRef<HTMLInputElement>(null)
  const venueNameRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const matches = useMemo(
    () => searchSavedVenues(availableVenues, query),
    [availableVenues, query]
  )

  useEffect(() => {
    setAvailableVenues((current) => mergeVenueOptions([...current, ...venues]))
  }, [venues])

  useEffect(() => {
    if (!open) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeSelector()
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const focusTimer = window.setTimeout(() => {
      if (mode === 'add') venueNameRef.current?.focus()
      else searchRef.current?.focus()
    })
    return () => window.clearTimeout(focusTimer)
  }, [mode, open])

  async function openSelector() {
    if (disabled) return
    setOpen(true)
    setMode('list')
    setQuery('')
    setError('')
    setNewVenue(EMPTY_VENUE_FORM)
    setLoading(true)
    try {
      const cloudVenues = await loadCloudVenues()
      setAvailableVenues(mergeVenueOptions([...venues, ...cloudVenues]))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Venues could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  function closeSelector() {
    setOpen(false)
    setMode('list')
    setSearchFocused(false)
    setError('')
    window.setTimeout(() => triggerRef.current?.focus())
  }

  function startAddingVenue(name = '') {
    setMode('add')
    setNewVenue({ ...EMPTY_VENUE_FORM, name })
    setError('')
  }

  function clearSearch() {
    setQuery('')
    searchRef.current?.focus()
  }

  function cancelSearch() {
    setQuery('')
    setSearchFocused(false)
    searchRef.current?.blur()
  }

  function selectVenue(venue: SavedVenueOption) {
    onSelect(venue)
    closeSelector()
  }

  async function saveNewVenue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newVenue.name.trim()
    if (!name || saving) return
    setSaving(true)
    setError('')
    try {
      const venue = await createCloudVenue({
        name,
        location: newVenue.location.trim(),
        notes: newVenue.notes.trim(),
      })
      setAvailableVenues((current) => mergeVenueOptions([...current, venue]))
      onSelect(venue)
      closeSelector()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The venue could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={inputId}
        type="button"
        disabled={disabled}
        onClick={() => void openSelector()}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={buttonClassName ?? 'flex min-h-11 w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-3 text-left text-sm font-medium text-stone-900'}
      >
        <span className="min-w-0 truncate">
          {value || <><span className="md:hidden">{mobilePlaceholder}</span><span className="hidden md:inline">{placeholder}</span></>}
        </span>
        <span className="ml-3 shrink-0 text-stone-400" aria-hidden="true">›</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] bg-white md:flex md:items-center md:justify-center md:bg-black/35 md:p-6">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="venue-selection-title"
            className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white md:h-auto md:max-h-[min(760px,calc(100vh-48px))] md:max-w-2xl md:rounded-2xl md:shadow-2xl"
          >
            <header className="grid min-h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-stone-200 px-4 pt-[env(safe-area-inset-top)] md:min-h-14 md:pt-0">
              <button
                type="button"
                onClick={closeSelector}
                className="min-h-11 justify-self-start rounded-lg px-1 text-sm font-semibold text-stone-600 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
              >
                ← Back
              </button>
              <h2 id="venue-selection-title" className="text-base font-semibold text-stone-950">
                {mode === 'add' ? 'Add New Venue' : 'Select Venue'}
              </h2>
              <button
                type="button"
                onClick={closeSelector}
                className="hidden min-h-11 justify-self-end rounded-lg px-2 text-sm font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 md:block"
              >
                Close
              </button>
            </header>

            {mode === 'list' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 space-y-3 border-b border-stone-100 p-4 md:p-5">
                  <div className="flex items-center gap-2">
                    <label className="relative min-w-0 flex-1">
                      <span className="sr-only">Search venues</span>
                      <input
                        ref={searchRef}
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setSearchFocused(false)}
                        placeholder="Search venues..."
                        className="h-12 w-full rounded-xl border border-stone-200 bg-white px-4 pr-11 text-base text-stone-950 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200 [&::-webkit-search-cancel-button]:appearance-none"
                      />
                      {query && (
                        <button
                          type="button"
                          aria-label="Clear venue search"
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={clearSearch}
                          className="absolute right-1 top-1/2 flex min-h-10 min-w-10 -translate-y-1/2 items-center justify-center rounded-full text-xl leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                        >
                          ×
                        </button>
                      )}
                    </label>
                    {searchFocused && (
                      <button
                        type="button"
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={cancelSearch}
                        className="min-h-11 shrink-0 rounded-lg px-1 text-base font-medium text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 md:hidden"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  {!query.trim() && (
                    <button
                      type="button"
                      onClick={() => startAddingVenue()}
                      className="flex min-h-12 w-full items-center rounded-xl border border-stone-300 px-4 text-left text-sm font-semibold text-stone-900 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                    >
                      + Add New Venue
                    </button>
                  )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 md:px-5 md:pb-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">Saved Venues</h3>
                    {loading && <span className="text-xs font-medium text-stone-400" aria-live="polite">Loading…</span>}
                  </div>
                  {error && <p className="mb-3 text-sm text-red-600" role="alert">{error}</p>}
                  <div role="listbox" aria-label="Saved venues" className="divide-y divide-stone-100">
                    {matches.map((venue) => (
                      <button
                        key={venue.id ?? `${venue.name}-${venue.location ?? ''}`}
                        type="button"
                        role="option"
                        aria-selected={normalizeVenueName(venue.name) === normalizeVenueName(value)}
                        onClick={() => selectVenue(venue)}
                        className="flex min-h-[64px] w-full items-center justify-between gap-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-900"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-base font-semibold text-stone-900">{venue.name}</span>
                          {venue.location && <span className="mt-0.5 block truncate text-sm text-stone-500">{venue.location}</span>}
                        </span>
                        <span className="shrink-0 text-stone-400" aria-hidden="true">›</span>
                      </button>
                    ))}
                    {!loading && matches.length === 0 && (
                      <div className="flex flex-col items-center py-8 text-center">
                        <p className="text-sm text-stone-500">No venues found.</p>
                        {query.trim() && (
                          <button
                            type="button"
                            onClick={() => startAddingVenue(query.trim())}
                            className="mt-3 min-h-11 rounded-lg px-3 text-sm font-semibold text-stone-900 underline decoration-stone-300 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                          >
                            Add &quot;{query.trim()}&quot; as a new venue
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={saveNewVenue} className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(24px,env(safe-area-inset-bottom))] md:p-5">
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-stone-600">Venue Name *</span>
                    <input
                      ref={venueNameRef}
                      value={newVenue.name}
                      onChange={(event) => setNewVenue((current) => ({ ...current, name: event.target.value }))}
                      required
                      className="h-12 w-full rounded-xl border border-stone-200 px-4 text-base text-stone-950 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-stone-600">Location</span>
                    <input
                      value={newVenue.location}
                      onChange={(event) => setNewVenue((current) => ({ ...current, location: event.target.value }))}
                      placeholder="City, State"
                      className="h-12 w-full rounded-xl border border-stone-200 px-4 text-base text-stone-950 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-stone-600">Notes (optional)</span>
                    <textarea
                      value={newVenue.notes}
                      onChange={(event) => setNewVenue((current) => ({ ...current, notes: event.target.value }))}
                      rows={4}
                      className="w-full resize-y rounded-xl border border-stone-200 px-4 py-3 text-base text-stone-950 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
                    />
                  </label>
                </div>
                {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
                <button
                  type="submit"
                  disabled={saving || !newVenue.name.trim()}
                  className="mt-6 min-h-12 w-full rounded-xl bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  )
}

export function mergeVenueOptions(venues: SavedVenueOption[]) {
  const merged = new Map<string, SavedVenueOption>()
  venues.forEach((venue) => {
    const name = venue.name.trim()
    if (!name) return
    const key = normalizeVenueName(name)
    const current = merged.get(key)
    merged.set(key, {
      ...current,
      ...venue,
      name: current?.name ?? name,
      id: venue.id ?? current?.id,
      location: venue.location ?? current?.location,
      notes: venue.notes ?? current?.notes,
      instagram: venue.instagram ?? current?.instagram,
      vendorId: venue.vendorId ?? current?.vendorId,
    })
  })
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name))
}
