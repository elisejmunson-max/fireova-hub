'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createCloudVendor, loadCloudVendors } from '@/lib/cloud-vendors'
import {
  canSaveSimplifiedVendor,
  filterVendorDirectoryEntries,
  formatInstagramHandle,
  getSimplifiedVendorBusinessName,
  getVendorCategoryOptions,
  normalizeInstagramHandle,
  type FireovaVendor,
} from '@/lib/local-fireova-vendors'
import type { LocalEventVendorCategory } from '@/lib/local-fireova-events'

type VendorSelectionWorkflowProps = {
  directoryVendors: FireovaVendor[]
  selectedVendorIds: string[]
  onDone: (vendors: FireovaVendor[]) => void | Promise<void>
  onDirectoryChange?: (vendors: FireovaVendor[]) => void
  onClose: () => void
}

type NewVendorForm = {
  category: LocalEventVendorCategory
  instagram: string
}

const EMPTY_VENDOR_FORM: NewVendorForm = { category: 'Other', instagram: '' }

export default function VendorSelectionWorkflow({
  directoryVendors,
  selectedVendorIds,
  onDone,
  onDirectoryChange,
  onClose,
}: VendorSelectionWorkflowProps) {
  const [mode, setMode] = useState<'list' | 'add'>('list')
  const [query, setQuery] = useState('')
  const [availableVendors, setAvailableVendors] = useState(() => mergeVendorOptions(directoryVendors))
  const [selectedIds, setSelectedIds] = useState(() => new Set(selectedVendorIds))
  const [newVendor, setNewVendor] = useState<NewVendorForm>(EMPTY_VENDOR_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const instagramRef = useRef<HTMLInputElement>(null)
  const initialDirectoryRef = useRef(directoryVendors)
  const directoryChangeRef = useRef(onDirectoryChange)
  directoryChangeRef.current = onDirectoryChange
  const matches = useMemo(
    () => filterVendorDirectoryEntries(availableVendors, query),
    [availableVendors, query]
  )
  const categories = useMemo(
    () => getVendorCategoryOptions(availableVendors).filter((category) => category !== 'Venue'),
    [availableVendors]
  )

  useEffect(() => {
    let active = true
    void loadCloudVendors().then((cloudVendors) => {
      if (!active) return
      const merged = mergeVendorOptions([...initialDirectoryRef.current, ...cloudVendors])
      setAvailableVendors(merged)
      directoryChangeRef.current?.(merged)
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Vendors could not be loaded.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
  }, [onClose])

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      if (mode === 'add') instagramRef.current?.focus()
      else searchRef.current?.focus()
    })
    return () => window.clearTimeout(focusTimer)
  }, [mode])

  function toggleVendor(vendorId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(vendorId)) next.delete(vendorId)
      else next.add(vendorId)
      return next
    })
    setError('')
  }

  async function finishSelection() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await onDone(availableVendors.filter((vendor) => selectedIds.has(vendor.id)))
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The vendors could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function saveNewVendor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const instagram = formatInstagramHandle(newVendor.instagram)
    if (!instagram || saving) return
    const existing = availableVendors.find((vendor) =>
      normalizeInstagramHandle(vendor.instagramHandle) === normalizeInstagramHandle(instagram)
    )
    if (existing) {
      setSelectedIds((current) => new Set(current).add(existing.id))
      setMode('list')
      setQuery('')
      setNewVendor(EMPTY_VENDOR_FORM)
      return
    }

    setSaving(true)
    setError('')
    try {
      const result = await createCloudVendor({
        category: newVendor.category,
        businessName: getSimplifiedVendorBusinessName(newVendor.category, instagram),
        instagramHandle: instagram,
        notes: '',
      })
      const merged = mergeVendorOptions([...availableVendors, ...result.vendors])
      setAvailableVendors(merged)
      setSelectedIds((current) => new Set(current).add(result.vendor.id))
      onDirectoryChange?.(merged)
      setMode('list')
      setQuery('')
      setNewVendor(EMPTY_VENDOR_FORM)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The vendor could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-white md:flex md:items-center md:justify-center md:bg-black/35 md:p-6">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vendor-selection-title"
        className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white md:h-auto md:max-h-[min(760px,calc(100vh-48px))] md:max-w-2xl md:rounded-2xl md:shadow-2xl"
      >
        <header className="grid min-h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-stone-200 px-4 pt-[env(safe-area-inset-top)] md:min-h-14 md:pt-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 justify-self-start rounded-lg px-1 text-sm font-semibold text-stone-600 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
          >
            ← Back
          </button>
          <h2 id="vendor-selection-title" className="whitespace-nowrap text-base font-semibold text-stone-950">
            Select Vendors
          </h2>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void finishSelection()}
            className="min-h-11 justify-self-end rounded-lg px-1 text-sm font-semibold text-stone-900 disabled:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
          >
            {saving ? 'Saving…' : 'Done'}
          </button>
        </header>

        {mode === 'list' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 space-y-3 border-b border-stone-100 p-4 md:p-5">
              <label className="block">
                <span className="sr-only">Search vendors</span>
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search vendors..."
                  className="h-12 w-full rounded-xl border border-stone-200 bg-white px-4 text-base text-stone-950 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
                />
              </label>
              <button
                type="button"
                onClick={() => { setMode('add'); setError('') }}
                className="flex min-h-12 w-full items-center rounded-xl border border-stone-300 px-4 text-left text-sm font-semibold text-stone-900 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
              >
                + Add New Vendor
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 md:px-5 md:pb-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">Vendor Directory</h3>
                {loading && <span className="text-xs font-medium text-stone-400" aria-live="polite">Loading…</span>}
              </div>
              {error && <p className="mb-3 text-sm text-red-600" role="alert">{error}</p>}
              <div role="listbox" aria-label="Vendor Directory" aria-multiselectable="true" className="divide-y divide-stone-100">
                {matches.map((vendor) => {
                  const selected = selectedIds.has(vendor.id)
                  return (
                    <button
                      key={vendor.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => toggleVendor(vendor.id)}
                      className="flex min-h-[64px] w-full items-center justify-between gap-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-900"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-base font-semibold text-stone-900">
                          {vendor.businessName || formatInstagramHandle(vendor.instagramHandle) || vendor.category}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-stone-500">
                          {[vendor.category, formatInstagramHandle(vendor.instagramHandle)].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                          selected ? 'border-stone-950 bg-stone-950 text-white' : 'border-stone-300 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                    </button>
                  )
                })}
                {!loading && matches.length === 0 && (
                  <p className="py-8 text-center text-sm text-stone-500">No vendors found.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={saveNewVendor} className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(24px,env(safe-area-inset-bottom))] md:p-5">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-stone-600">Category</span>
                <select
                  value={newVendor.category}
                  onChange={(event) => setNewVendor((current) => ({ ...current, category: event.target.value as LocalEventVendorCategory }))}
                  className="h-12 w-full rounded-xl border border-stone-200 bg-white px-4 text-base text-stone-950 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
                >
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-stone-600">Instagram</span>
                <input
                  ref={instagramRef}
                  value={newVendor.instagram}
                  onChange={(event) => setNewVendor((current) => ({ ...current, instagram: event.target.value }))}
                  placeholder="@username"
                  className="h-12 w-full rounded-xl border border-stone-200 px-4 text-base text-stone-950 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
                />
              </label>
            </div>
            {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => { setMode('list'); setError('') }}
                className="min-h-12 flex-1 rounded-xl border border-stone-300 px-5 text-sm font-semibold text-stone-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !canSaveSimplifiedVendor(newVendor.instagram)}
                className="min-h-12 flex-1 rounded-xl bg-stone-950 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? 'Saving…' : 'Add Vendor'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}

export function mergeVendorOptions(vendors: FireovaVendor[]) {
  const merged = new Map<string, FireovaVendor>()
  vendors.forEach((vendor) => {
    if (!vendor.id || vendor.category === 'Venue') return
    const handle = normalizeInstagramHandle(vendor.instagramHandle)
    const key = handle ? `handle:${handle}` : `id:${vendor.id}`
    const current = merged.get(key)
    merged.set(key, { ...current, ...vendor, id: vendor.id })
  })
  return [...merged.values()].sort((left, right) =>
    (left.businessName || left.instagramHandle || left.category)
      .localeCompare(right.businessName || right.instagramHandle || right.category)
  )
}
