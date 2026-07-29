'use client'

import { useEffect, useRef, useState } from 'react'
import { searchSavedVenues, type SavedVenueOption } from '@/lib/local-fireova-venues'

export default function VenueAutocomplete({ value, venues, disabled = false, placeholder = 'Venue Name', ariaLabel = 'Venue Name', inputId, inputClassName, showAddNew = false, onChange, onSelect, onAddNew }: {
  value: string
  venues: SavedVenueOption[]
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
  inputId?: string
  inputClassName?: string
  showAddNew?: boolean
  onChange: (value: string) => void
  onSelect: (venue: SavedVenueOption) => void
  onAddNew?: (value: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const matches = searchSavedVenues(venues, value)

  useEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [open])

  function selectVenue(venue: SavedVenueOption) {
    onSelect(venue)
    setOpen(false)
    setActiveIndex(-1)
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <input
        id={inputId}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="venue-autocomplete-results"
        value={value}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActiveIndex(-1) }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index + 1, matches.length - 1)) }
          if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)) }
          if (event.key === 'Enter' && open) { event.preventDefault(); if (activeIndex >= 0 && matches[activeIndex]) selectVenue(matches[activeIndex]); else setOpen(false) }
        }}
        placeholder={placeholder}
        className={inputClassName ?? 'min-h-[38px] w-full rounded-lg bg-white px-3 text-sm font-medium text-stone-950 ring-1 ring-stone-200 outline-none transition placeholder:text-stone-400 focus:ring-2 focus:ring-stone-950 disabled:bg-stone-100'}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400" aria-hidden="true">⌄</span>
      {open && (
        <div id="venue-autocomplete-results" role="listbox" className="absolute left-0 right-0 top-[42px] z-30 max-h-60 overflow-y-auto rounded-xl bg-white p-1.5 shadow-[0_16px_40px_rgba(28,25,23,0.14)] ring-1 ring-stone-200">
          {matches.length > 0 ? matches.map((venue, index) => (
            <button key={`${venue.name}-${venue.instagram ?? ''}`} type="button" role="option" aria-selected={index === activeIndex} onMouseDown={(event) => event.preventDefault()} onClick={() => selectVenue(venue)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${index === activeIndex ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
              <span className="min-w-0 truncate text-sm font-semibold text-stone-800">{venue.name}</span>
              {venue.instagram && <span className="shrink-0 text-xs font-medium text-stone-500">{venue.instagram}</span>}
            </button>
          )) : !showAddNew && (
            <button type="button" onClick={() => setOpen(false)} className="w-full rounded-lg px-3 py-2 text-left"><span className="block text-xs font-medium text-stone-400">No matches</span><span className="mt-0.5 block text-sm font-semibold text-stone-800">Use new venue</span></button>
          )}
          {showAddNew && (
            <button
              type="button"
              disabled={!value.trim()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const newVenueName = value.trim()
                if (!newVenueName) return
                onAddNew?.(newVenueName)
                setOpen(false)
                setActiveIndex(-1)
              }}
              className="mt-1 flex min-h-11 w-full items-center rounded-lg border-t border-stone-100 px-3 py-2 text-left text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:text-stone-400"
            >
              + Add new venue{value.trim() ? ` “${value.trim()}”` : ''}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
