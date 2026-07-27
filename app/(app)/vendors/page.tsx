'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  addLocalVendorCategory,
  createLocalVendor,
  deleteLocalVendorSafely,
  getVendorCategoryOptions,
  getVendorUsageSummary,
  filterVendorDirectoryEntries,
  migrateEmbeddedEventVendorsToDirectory,
  readLocalVendors,
  readLocalVendorCategories,
  removeLocalVendorCategory,
  reassignAndRemoveLocalVendorCategory,
  searchLocalVendors,
  updateLocalVendor,
  type FireovaVendor,
  type FireovaVendorInput,
} from '@/lib/local-fireova-vendors'
import type { LocalEventVendorCategory } from '@/lib/local-fireova-events'

type VendorFilter = LocalEventVendorCategory | 'All'
type VendorSort = 'Alphabetical' | 'Recently Used'

export default function VendorsPage() {
  const [vendors, setVendors] = useState<FireovaVendor[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<VendorFilter>('All')
  const [sort, setSort] = useState<VendorSort>('Alphabetical')
  const [editingVendor, setEditingVendor] = useState<FireovaVendor | null>(null)
  const [addingVendor, setAddingVendor] = useState(false)
  const [deleteWarning, setDeleteWarning] = useState('')
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState<LocalEventVendorCategory[]>([])
  const [cloudStatus, setCloudStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading')

  useEffect(() => {
    migrateEmbeddedEventVendorsToDirectory()
    void refreshVendors()
  }, [])

  const visibleVendors = useMemo(() => {
    const filtered = filterVendorDirectoryEntries(vendors, query, category)

    if (sort === 'Recently Used') {
      return filtered.sort((a, b) => {
        const aDate = getVendorUsageSummary(a.id).mostRecentEvent?.date ?? ''
        const bDate = getVendorUsageSummary(b.id).mostRecentEvent?.date ?? ''
        return getDateTime(bDate) - getDateTime(aDate)
      })
    }

    return filtered.sort((a, b) => a.businessName.localeCompare(b.businessName))
  }, [category, query, sort, vendors])
  async function refreshVendors() {
    setCloudStatus('loading')
    try {
      const response = await fetch('/api/vendors', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Vendors could not be loaded.')
      setVendors(result.vendors)
      setCategoryOptions(result.categories)
      setCloudStatus('saved')
    } catch (error) {
      setCloudStatus('error')
      setDeleteWarning(error instanceof Error ? error.message : 'Vendors could not be loaded.')
    }
  }

  async function saveVendor(input: FireovaVendorInput, vendorId?: string) {
    setCloudStatus('saving')
    try {
      const response = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor: { ...input, id: vendorId } }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'The vendor could not be saved.')
      setVendors(result.vendors)
      setCategoryOptions(result.categories)
      setAddingVendor(false)
      setEditingVendor(null)
      setCloudStatus('saved')
    } catch (error) {
      setCloudStatus('error')
      setDeleteWarning(error instanceof Error ? error.message : 'The vendor could not be saved.')
    }
  }

  async function deleteVendor(vendor: FireovaVendor) {
    setCloudStatus('saving')
    const response = await fetch(`/api/vendors?id=${encodeURIComponent(vendor.id)}`, { method: 'DELETE' })
    const result = await response.json()
    if (!response.ok) {
      setCloudStatus('error')
      setDeleteWarning(result.error || 'The vendor could not be deleted.')
      return
    }
    setVendors(result.vendors)
    setCategoryOptions(result.categories)
    setDeleteWarning('Vendor deleted.')
    setCloudStatus('saved')
  }

  function togglePreferred(vendor: FireovaVendor) {
    void saveVendor({ ...vendor, preferredVendor: !vendor.preferredVendor }, vendor.id)
  }

  return (
    <div className="min-h-full bg-white pb-10">
      <div className="px-5 pb-5 pt-7 sm:px-8 sm:pb-7 sm:pt-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">
              Vendor Directory
            </p>
            <h1 className="text-[34px] font-semibold leading-none text-stone-950 sm:text-5xl">Vendors</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-6 text-stone-500">
              Save Fireova event partners once, then reuse them for future credits and tagging.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCategoryManagerOpen(true)} className="w-fit rounded-full bg-stone-100 px-5 py-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-200">Manage Categories</button>
            <button type="button" onClick={() => setAddingVendor(true)} className="w-fit rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800">Add Vendor</button>
          </div>
        </div>
      </div>

      <div className="px-5 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-5">
          <section className="grid gap-3 rounded-[28px] bg-stone-50 p-3 ring-1 ring-stone-100 sm:grid-cols-[1fr_190px_180px] sm:p-4">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search vendors"
              className="h-12 rounded-2xl border border-stone-200 bg-white px-4 text-[15px] text-stone-950 outline-none focus:border-transparent focus:ring-2 focus:ring-stone-950"
            />
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as VendorFilter)}
              className="h-12 rounded-2xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 outline-none focus:border-transparent focus:ring-2 focus:ring-stone-950"
            >
              <option value="All">All categories</option>
              {categoryOptions.map((vendorCategory) => (
                <option key={vendorCategory} value={vendorCategory}>{vendorCategory}</option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as VendorSort)}
              className="h-12 rounded-2xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 outline-none focus:border-transparent focus:ring-2 focus:ring-stone-950"
            >
              <option value="Alphabetical">Alphabetical</option>
              <option value="Recently Used">Recently used</option>
            </select>
          </section>

          {deleteWarning && (
            <div className="rounded-2xl bg-ember-50 px-4 py-3 text-sm font-semibold text-ember-800 ring-1 ring-ember-100">
              {deleteWarning}
            </div>
          )}
          <p aria-live="polite" className="text-xs font-semibold text-stone-500">
            {cloudStatus === 'loading' ? 'Loading from Fireova Cloud…' : cloudStatus === 'saving' ? 'Saving…' : cloudStatus === 'saved' ? 'Saved to Fireova Cloud' : 'Cloud save needs attention'}
          </p>

          {visibleVendors.length === 0 ? (
            <section className="rounded-[30px] bg-stone-50 px-6 py-12 text-center ring-1 ring-stone-100">
              <h2 className="text-2xl font-semibold text-stone-950">No vendors yet</h2>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-6 text-stone-500">
                Add a vendor here or create one while editing an event.
              </p>
            </section>
          ) : (
            <section className="grid gap-4 lg:grid-cols-2">
              {visibleVendors.map((vendor) => (
                <VendorCard
                  key={vendor.id}
                  vendor={vendor}
                  onEdit={() => setEditingVendor(vendor)}
                  onDelete={() => deleteVendor(vendor)}
                  onTogglePreferred={() => togglePreferred(vendor)}
                />
              ))}
            </section>
          )}
        </div>
      </div>

      {(addingVendor || editingVendor) && (
        <VendorFormDialog
          vendor={editingVendor}
          categoryOptions={categoryOptions}
          onCancel={() => {
            setAddingVendor(false)
            setEditingVendor(null)
          }}
          onSave={(input) => saveVendor(input, editingVendor?.id)}
        />
      )}
      {categoryManagerOpen && (
        <CategoryManagerDialog
          categories={categoryOptions}
          vendors={vendors}
          onClose={() => setCategoryManagerOpen(false)}
          onAddCategory={(name) => {
            void fetch('/api/vendors', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'category', name }),
            }).then(() => refreshVendors())
          }}
          onRemoveCategory={(name) => {
            void fetch('/api/vendors', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'delete-category', name }),
            }).then(async (response) => {
              const result = await response.json()
              if (!response.ok) setDeleteWarning(result.error)
              await refreshVendors()
            })
          }}
          onReassignCategory={(name, replacement) => {
            void fetch('/api/vendors', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'reassign-category', name, replacement }),
            }).then(() => refreshVendors())
          }}
        />
      )}
    </div>
  )
}

function VendorCard({
  vendor,
  onEdit,
  onDelete,
  onTogglePreferred,
}: {
  vendor: FireovaVendor
  onEdit: () => void
  onDelete: () => void
  onTogglePreferred: () => void
}) {
  const usage = getVendorUsageSummary(vendor.id)

  return (
    <article className="rounded-[28px] bg-white p-5 shadow-[0_18px_60px_rgba(28,25,23,0.07)] ring-1 ring-stone-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-ember-50 px-3 py-1.5 text-xs font-semibold text-ember-800 ring-1 ring-ember-100">
              {vendor.category}
            </span>
            {vendor.preferredVendor && (
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                Preferred
              </span>
            )}
          </div>
          <Link href={`/vendors/${vendor.id}`} className="text-xl font-semibold text-stone-950 hover:text-ember-700">
            {vendor.businessName}
          </Link>
          <div className="mt-3 space-y-1.5 text-sm text-stone-500">
            {vendor.instagramHandle && <p>@{vendor.instagramHandle}</p>}
            {vendor.website && <p>{vendor.website}</p>}
            {vendor.email && <p>{vendor.email}</p>}
            {vendor.phone && <p>{vendor.phone}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={onTogglePreferred}
          className="rounded-full bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-200"
        >
          {vendor.preferredVendor ? 'Unmark' : 'Preferred'}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <MiniStat label="Linked Events" value={usage.linkedEventCount.toString()} />
        <MiniStat label="Recent Event" value={usage.mostRecentEvent?.date ?? 'None'} />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Link
          href={`/vendors/${vendor.id}`}
          className="rounded-full bg-stone-950 px-3 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-stone-800"
        >
          Open
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full bg-stone-100 px-3 py-3 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-200"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full bg-red-50 px-3 py-3 text-sm font-semibold text-red-600 ring-1 ring-red-100"
        >
          Delete
        </button>
      </div>
    </article>
  )
}

function CategoryManagerDialog({
  categories,
  vendors,
  onClose,
  onAddCategory,
  onRemoveCategory,
  onReassignCategory,
}: {
  categories: LocalEventVendorCategory[]
  vendors: FireovaVendor[]
  onClose: () => void
  onAddCategory: (name: string) => void
  onRemoveCategory: (name: string) => void
  onReassignCategory: (name: string, replacement: string) => void
}) {
  const [newCategory, setNewCategory] = useState('')
  const [notice, setNotice] = useState('')
  const [categoryToRemove, setCategoryToRemove] = useState('')
  const [replacementCategory, setReplacementCategory] = useState('Other')

  function addCategory() {
    if (!newCategory.trim()) return
    onAddCategory(newCategory.trim())
    setNewCategory('')
    setNotice('')
  }

  function removeCategory(category: string) {
    if (vendors.some((vendor) => vendor.category === category)) {
      setCategoryToRemove(category)
      setReplacementCategory('Other')
      setNotice('')
      return
    }
    onRemoveCategory(category)
    setNotice('')
  }

  function reassignAndRemoveCategory() {
    if (!replacementCategory || replacementCategory === categoryToRemove) return
    onReassignCategory(categoryToRemove, replacementCategory)
    setCategoryToRemove('')
    setNotice('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0 backdrop-blur-sm sm:items-center sm:px-5 sm:py-5" role="dialog" aria-modal="true" aria-labelledby="category-manager-title">
      <div className="max-h-[85vh] w-full overflow-hidden rounded-t-[30px] bg-white shadow-[0_24px_80px_rgba(28,25,23,0.24)] sm:max-w-lg sm:rounded-[30px]">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4 sm:px-6">
          <h2 id="category-manager-title" className="text-xl font-semibold text-stone-950">Manage Categories</h2>
          <button type="button" onClick={onClose} aria-label="Close category manager" className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200">×</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-5 sm:px-6">
          <div className="flex gap-2">
            <input value={newCategory} onChange={(event) => { setNewCategory(event.target.value); setNotice('') }} onKeyDown={(event) => { if (event.key === 'Enter') addCategory() }} placeholder="New category" className="h-11 min-w-0 flex-1 rounded-xl border border-stone-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-stone-950" />
            <button type="button" onClick={addCategory} disabled={!newCategory.trim()} className="rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white disabled:opacity-40">Add</button>
          </div>
          {notice && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{notice}</p>}
          {categoryToRemove && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-100">
              <p className="text-sm font-semibold text-stone-900">Move vendors from {categoryToRemove} before removing it.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select aria-label={`Move ${categoryToRemove} vendors to`} value={replacementCategory} onChange={(event) => setReplacementCategory(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-stone-200">
                  {categories.filter((category) => category !== categoryToRemove && category !== 'Venue').map((category) => <option key={category}>{category}</option>)}
                </select>
                <button type="button" onClick={reassignAndRemoveCategory} className="rounded-lg bg-stone-950 px-4 py-2 text-sm font-semibold text-white">Move & Remove</button>
                <button type="button" onClick={() => setCategoryToRemove('')} className="px-3 py-2 text-sm font-semibold text-stone-600">Cancel</button>
              </div>
            </div>
          )}
          <div className="mt-4 divide-y divide-stone-100">
            {categories.map((category) => {
              const inUse = vendors.some((vendor) => vendor.category === category)
              const protectedCategory = category === 'Venue' || category === 'Other'
              return (
                <div key={category} className="flex min-h-10 items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate text-sm font-semibold text-stone-800">{category}</span>
                  <button type="button" onClick={() => removeCategory(category)} disabled={protectedCategory} aria-label={`Remove ${category} category`} title={inUse ? `Move vendors from ${category} and remove it` : `Remove ${category}`} className="rounded-md px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-stone-300">Remove</button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function VendorFormDialog({
  vendor,
  categoryOptions,
  onCancel,
  onSave,
}: {
  vendor: FireovaVendor | null
  categoryOptions: LocalEventVendorCategory[]
  onCancel: () => void
  onSave: (input: FireovaVendorInput) => void
}) {
  const [category, setCategory] = useState<LocalEventVendorCategory>(vendor?.category ?? 'Other')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [businessName, setBusinessName] = useState(vendor?.businessName ?? '')
  const [instagramHandle, setInstagramHandle] = useState(vendor?.instagramHandle ?? '')
  const [website, setWebsite] = useState(vendor?.website ?? '')
  const [email, setEmail] = useState(vendor?.email ?? '')
  const [phone, setPhone] = useState(vendor?.phone ?? '')
  const [contactName, setContactName] = useState(vendor?.contactName ?? '')
  const [notes, setNotes] = useState(vendor?.notes ?? '')
  const [preferredVendor, setPreferredVendor] = useState(vendor?.preferredVendor ?? false)

  function handleSave() {
    if (!businessName.trim() || !category.trim()) return

    onSave({
      category: category.trim(),
      businessName: businessName.trim(),
      instagramHandle,
      website,
      email,
      phone,
      contactName,
      notes,
      preferredVendor,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0 backdrop-blur-sm sm:items-center sm:px-5 sm:py-5">
      <div className="max-h-[92vh] w-full overflow-hidden rounded-t-[30px] bg-white shadow-[0_24px_80px_rgba(28,25,23,0.24)] sm:max-w-2xl sm:rounded-[30px]">
        <div className="border-b border-stone-100 px-5 py-4 sm:px-6">
          <h2 className="text-2xl font-semibold text-stone-950">{vendor ? 'Edit Vendor' : 'Add Vendor'}</h2>
        </div>
        <div className="max-h-[calc(92vh-145px)] space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-500">Category</span>
            <select
              value={creatingCategory ? '__new__' : category}
              onChange={(event) => {
                if (event.target.value === '__new__') {
                  setCreatingCategory(true)
                  setCategory('')
                } else {
                  setCreatingCategory(false)
                  setCategory(event.target.value)
                }
              }}
              className="h-12 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-stone-950"
            >
              {categoryOptions.map((vendorCategory) => <option key={vendorCategory} value={vendorCategory}>{vendorCategory}</option>)}
              <option value="__new__">+ Create new category…</option>
            </select>
            {creatingCategory && (
              <input autoFocus value={category} onChange={(event) => setCategory(event.target.value)} placeholder="New category name" className="mt-2 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-stone-950" />
            )}
            <p className="mt-1.5 text-xs text-stone-400">Choose a category or create a new one.</p>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Business Name" value={businessName} onChange={setBusinessName} />
            <TextField label="Instagram Handle" value={instagramHandle} onChange={setInstagramHandle} />
            <TextField label="Website" value={website} onChange={setWebsite} />
            <TextField label="Email" value={email} onChange={setEmail} />
            <TextField label="Phone" value={phone} onChange={setPhone} />
            <TextField label="Contact Name" value={contactName} onChange={setContactName} />
          </div>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-500">Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-[100px] w-full resize-none rounded-[22px] border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-900 outline-none focus:ring-2 focus:ring-stone-950" />
          </label>
          <label className="flex items-center gap-3 rounded-2xl bg-stone-50 px-4 py-3 ring-1 ring-stone-100">
            <input type="checkbox" checked={preferredVendor} onChange={(event) => setPreferredVendor(event.target.checked)} />
            <span className="text-sm font-semibold text-stone-800">Preferred vendor</span>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-stone-100 px-5 py-4 sm:flex sm:justify-end sm:px-6">
          <button type="button" onClick={onCancel} className="rounded-full bg-stone-100 px-5 py-3 text-sm font-semibold text-stone-800">Cancel</button>
          <button type="button" onClick={handleSave} className="rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white">Save Vendor</button>
        </div>
      </div>
    </div>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-stone-950" />
    </label>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 px-3 py-3 ring-1 ring-stone-100">
      <p className="truncate text-sm font-semibold text-stone-950">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
    </div>
  )
}

function getDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}
