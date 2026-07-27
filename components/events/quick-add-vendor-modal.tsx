'use client'

import { useEffect, useRef, useState } from 'react'
import { canSaveSimplifiedVendor, filterVendorDirectoryEntries, formatInstagramHandle, getVendorCategoryOptions, type FireovaVendor } from '@/lib/local-fireova-vendors'
import type { LocalEventVendorCategory } from '@/lib/local-fireova-events'

export default function QuickAddVendorModal({ directoryVendors, onAddSaved, onAddNew, onClose }: {
  directoryVendors: FireovaVendor[]
  onAddSaved: (vendor: FireovaVendor) => boolean
  onAddNew: (category: LocalEventVendorCategory, instagram: string) => boolean
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [creating, setCreating] = useState(false)
  const [category, setCategory] = useState<LocalEventVendorCategory>('Other')
  const [instagram, setInstagram] = useState('')
  const [error, setError] = useState('')
  const matches = filterVendorDirectoryEntries(directoryVendors, search).filter((vendor) => vendor.category !== 'Venue')
  const categories = getVendorCategoryOptions(directoryVendors).filter((option) => option !== 'Venue')

  useEffect(() => inputRef.current?.focus(), [])
  function select(vendor: FireovaVendor) {
    try {
      if (!onAddSaved(vendor)) setError('This vendor could not be added. It may already be linked to this event.')
    } catch (saveError) {
      console.error('Unable to add vendor', saveError)
      setError('This vendor could not be added. Please try again.')
    }
  }
  function beginNew() { setInstagram(formatInstagramHandle(search) ?? (search.trim().startsWith('@') ? search.trim() : '')); setCreating(true); setError('') }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="quick-add-vendor-title">
      <button type="button" aria-label="Close Add Vendor modal" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-black/30 backdrop-blur-[1px]" />
      <section className="relative z-10 flex max-h-[85vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_24px_90px_rgba(28,25,23,0.28)] ring-1 ring-stone-200 sm:max-h-[70vh] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4"><h2 id="quick-add-vendor-title" className="text-xl font-semibold">Add Vendor</h2><button type="button" onClick={onClose} aria-label="Close Add Vendor" className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-lg text-stone-500">×</button></div>
        <div className="overflow-y-auto px-5 py-5">
          {!creating ? <div className="space-y-3">
            <input ref={inputRef} role="combobox" aria-label="Search vendors" aria-autocomplete="list" aria-expanded={Boolean(search.trim())} value={search} onChange={(event) => { setSearch(event.target.value); setActiveIndex(-1); setError('') }} onKeyDown={(event) => {
              if (event.key === 'Escape') onClose()
              if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, matches.length - 1)) }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)) }
              if (event.key === 'Enter' && search.trim()) { event.preventDefault(); if (activeIndex >= 0 && matches[activeIndex]) select(matches[activeIndex]); else if (matches.length === 1) select(matches[0]); else if (matches.length === 0) beginNew() }
            }} placeholder="Search vendors by name, category, or @handle" className="min-h-[46px] w-full rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-950" />
            {!search.trim() ? <div className="flex items-center justify-between gap-3"><p className="text-sm text-stone-400">Search your Vendor Directory</p><button type="button" onClick={beginNew} className="px-2 py-1.5 text-sm font-semibold">+ Create new vendor</button></div> : <div role="listbox" className="max-h-[55vh] overflow-y-auto rounded-lg ring-1 ring-stone-200">{matches.length ? matches.map((vendor, index) => <button key={vendor.id} type="button" role="option" aria-selected={index === activeIndex} onClick={() => select(vendor)} className={`block min-h-11 w-full border-b border-stone-100 px-3 py-2.5 text-left text-sm last:border-0 ${index === activeIndex ? 'bg-stone-100' : 'hover:bg-stone-50'}`}><strong>{vendor.category}</strong><span className="text-stone-400"> · </span><strong>{formatInstagramHandle(vendor.instagramHandle) ?? vendor.businessName}</strong></button>) : <button type="button" onClick={beginNew} className="min-h-11 w-full px-3 text-left text-sm font-semibold">Add new vendor: {formatInstagramHandle(search) ?? search.trim()}</button>}</div>}
          </div> : <div className="grid gap-3 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200"><label><span className="text-xs font-semibold text-stone-500">Category</span><select value={category} onChange={(event) => setCategory(event.target.value as LocalEventVendorCategory)} className="mt-1 min-h-10 w-full rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-stone-200">{categories.map((option) => <option key={option}>{option}</option>)}</select></label><label><span className="text-xs font-semibold text-stone-500">Instagram</span><input value={instagram} onChange={(event) => setInstagram(event.target.value)} placeholder="@username" className="mt-1 min-h-10 w-full rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-stone-200" /></label><div className="flex gap-2"><button type="button" onClick={() => setCreating(false)} className="px-4 py-2 text-sm font-semibold">Back</button><button type="button" disabled={!canSaveSimplifiedVendor(instagram)} onClick={() => { if (!onAddNew(category, instagram)) setError('Enter a valid Instagram handle that is not already added.') }} className="rounded-lg bg-stone-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add Vendor</button></div></div>}
          {error && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{error}</p>}
        </div>
      </section>
    </div>
  )
}
